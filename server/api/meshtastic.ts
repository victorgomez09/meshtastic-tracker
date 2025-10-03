import { ORPCError } from '@orpc/client';
import * as mqtt from 'mqtt';
import path from 'path';
import protobufjs from 'protobufjs';
import z from 'zod';
import { type DrizzleUpsertData, transformPositionToNodeUpdate, transformUserToNodeUpdate } from '../utils/meshtastic';
import { createDB, db } from '../db';
import { nodes } from '../db/schema/node';

const BROKER_URL = 'mqtts://mqtt.meshtastic.org';
const UNIVERSAL_PROTOBUF_TOPIC = 'msh/+/2/e/#';

// load protobufs
const root = new protobufjs.Root();
root.resolvePath = (_, target) => path.join(path.join(process.cwd(), "src/proto"), target);
root.loadSync('meshtastic/mqtt.proto');
const Data = root.lookupType("Data");
const ServiceEnvelope = root.lookupType("ServiceEnvelope");
const MapReport = root.lookupType("MapReport");
const NeighborInfo = root.lookupType("NeighborInfo");
const Position = root.lookupType("Position");
const RouteDiscovery = root.lookupType("RouteDiscovery");
const Telemetry = root.lookupType("Telemetry");
const User = root.lookupType("User");
const Waypoint = root.lookupType("Waypoint");

// Define the map outside the function
const PayloadTypeMap: { [key: string]: protobufjs.Type } = {
    'POSITION_APP': Position,
    'TELEMETRY_APP': Telemetry,
    'NODEINFO_APP': User,
    // Add others as you encounter them
    // 'WAYPOINT_APP': Waypoint,
    // 'MAPREPORT_APP': MapReport,
    // 'NEIGHBORINFO_APP': NeighborInfo,
    // 'ROUTE_DISCOVERY_APP': RouteDiscovery,
};


export function startMqttClient() {
    const clientId = 'mqtt_ingest_service_' + Math.random().toString(16).substr(2, 8);
    const options: mqtt.IClientOptions = {
        clientId: clientId,
        username: "meshdev",
        password: "large4cats",
        clean: true,
        rejectUnauthorized: false,
        protocol: 'mqtts',
    };

    const client = mqtt.connect(BROKER_URL, options);

    client.on('connect', () => {
        console.log(`Conectado al broker Meshtastic. Suscribiendo...`);
        client.subscribe(UNIVERSAL_PROTOBUF_TOPIC, (err) => {
            if (err) console.error("Error al suscribirse:", err);
            else console.log("Subscripción a temas globales exitosa.");
        });
    });

    client.on('message', async (topic, message) => {
        try {
            // 1. Decode the ServiceEnvelope from the MQTT buffer
            const envelope = ServiceEnvelope.decode(message);
            const decodedEnvelope = envelope.toJSON();
            const packet = decodedEnvelope.packet;

            // 2. Check for an encrypted payload (cannot be processed without the key)
            if (packet?.encrypted) {
                console.log(`[DATA SKIPPED] Packet is encrypted on channel ${decodedEnvelope.channelId}. Cannot decode payload without the channel key.`);
                return; // Stop processing this packet
            }

            // 3. Check for the string portnum and payload data
            const portnumString = packet?.decoded?.portnum;
            const payloadBase64 = packet?.decoded?.payload;

            if (portnumString && payloadBase64) {
                const ProtoType = PayloadTypeMap[portnumString];

                if (ProtoType) {
                    // a. Convert Base64 string back to a Protobuf Buffer
                    const payloadBuffer = Buffer.from(payloadBase64, 'base64');

                    // b. Decode the inner payload using the correct Protobuf Type
                    const innerPayload = ProtoType.decode(payloadBuffer);
                    const decodedPayload = innerPayload.toJSON();

                    const nodeId = packet.from;

                    let updateData: DrizzleUpsertData = {
                        id: nodeId.toString(16),
                        lastSeen: new Date()
                    };

                    switch (portnumString) {
                        case 'POSITION_APP':
                            updateData = transformPositionToNodeUpdate(nodeId, decodedPayload);
                            console.log("Saving POSITION_APP data:", updateData);
                            break;

                        case 'NODEINFO_APP':
                            updateData = transformUserToNodeUpdate(nodeId, decodedPayload);
                            console.log("Saving NODEINFO_APP data:", updateData);
                            break;

                        case 'TELEMETRY_APP':
                            // Telemetry usually goes into a separate `telemetry` table, 
                            // but you still update `lastSeen` on the `nodes` table.
                            console.log("Processed TELEMETRY_APP. Node update minimal.");
                            break;

                        default:
                            // For any other type, just ensure 'id' and 'lastSeen' are set.
                            console.log(`[HANDLER] Unhandled specific payload type: ${portnumString}. Minimal node update.`);
                            break;
                    }

                    // Perform the UPSERT operation for the node
                    // Note: Drizzle's `onConflictDoUpdate` is the equivalent of an UPSERT.
                    if (Object.keys(updateData).length > 1) { // Check if we have more than just 'id' to update
                        try {
                            // You'll need to import `sql` and `eq` from 'drizzle-orm'
                            await db.insert(nodes)
                                .values(updateData)
                                .onConflictDoUpdate({
                                    target: nodes.id, // Conflict target is the primary key
                                    set: updateData, // Set the new data on conflict
                                });
                            console.log(`Node ${updateData.id} successfully updated/inserted.`);
                        } catch (dbErr) {
                            console.error(`DB Error during UPSERT for node ${updateData.id}:`, dbErr);
                        }
                    }
                } else {
                    console.log(`[DECODE ERROR] Unhandled Protobuf mapping for portnum: ${portnumString}`);
                }
            } else {
                // This covers non-encrypted packets that don't fit the expected structure 
                // (e.g., certain internal packets, or if the packet is just a text message with no structured payload)
                console.log("Packet has no processable 'portnum' and 'payload' or is an unhandled internal type.");
            }

            // 5. Always update the node's "last seen" metadata
            const nodeId = packet?.from;
            if (nodeId) {
                // TODO: Use the gatewayId, rxTime, rxSnr, rxRssi to update the node status
            }
        } catch (e) {
            console.error(`[PROCESS ERROR] Error al procesar mensaje en ${topic} con el mensaje ${message.toString("utf-8")}:`, e);
        }
    });

    client.on('error', (err) => {
        console.error("Error en el cliente MQTT:", err);
    });

    client.on('close', () => {
        console.log("Conexión MQTT cerrada. Intentando reconectar...");
    });
}

export const getAll = async (): Promise<z.infer<typeof nodes>[]> => {
    try {
        return db.select().from(nodes);
    } catch (err) {
        throw new ORPCError("BAD_REQUEST", { cause: err })
    }
}