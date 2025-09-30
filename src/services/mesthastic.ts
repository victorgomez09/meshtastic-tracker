import * as mqtt from 'mqtt';
import { nodes, nodesCreateSchema } from '../models'
import { db } from '../database';
import z from 'zod';
import { isJSON } from '../utils/json';
import { ORPCError } from '@orpc/client';

const BROKER_URL = 'mqtts://mqtt.meshtastic.org';
// Suscripción universal para NodeInfo (todos los nodos) y Posición
const UNIVERSAL_TOPICS = [
    'msh/+/2/json/#/nodeinfo',
    'msh/+/2/json/#/position'
];

export function startMqttClient() {
    // Genera una ID de cliente única y aleatoria
    const clientId = 'mqtt_ingest_service_' + Math.random().toString(16).substr(2, 8);
    // Configuración para la conexión anónima, forzando la ID
    const options: mqtt.IClientOptions = {
        clientId: clientId,
        username: "meshdev",
        password: "large4cats",
        clean: true, // Iniciar una nueva sesión cada vez (no intentar reanudar)
        // *** LÍNEA CLAVE PARA IGNORAR EL ERROR DE CERTIFICADO ***
        rejectUnauthorized: false,
        // *** CAMBIO CRUCIAL: Forzar el uso del protocolo seguro/TLS ***
        protocol: 'mqtts',
    };

    const client = mqtt.connect(BROKER_URL, options);

    client.on('connect', () => {
        console.log(`Conectado al broker Meshtastic. Suscribiendo...`);
        client.subscribe("msh/+/2/json/#", (err) => {
            if (err) console.error("Error al suscribirse:", err);
            else console.log("Subscripción a temas globales exitosa.");
        });
    });

    client.on('message', async (topic, message) => {
        try {
            const jsonString = message.toString("utf-8");
            if (isJSON(jsonString)) {
                const data = JSON.parse(jsonString);

                // **VALIDACIÓN CRÍTICA**
                if (!data.sender) {
                    console.warn(`[PROCESS SKIP] Mensaje de ${topic} ignorado: 'sender' es nulo o indefinido.`);
                    return; // Detiene el procesamiento si no hay remitente
                }

                const nodeId = data.sender.replace('!', '');
                const region = topic.split('/')[1];
                const now = new Date();

                const messageType = data.type;
                // 2. Filtrado y Procesamiento
                if (messageType === 'position' || messageType === 'nodeinfo') {

                    let updateData: Partial<z.infer<typeof nodesCreateSchema>> = {
                        lastSeen: now,
                        region: region,
                    };

                    // --- Lógica de Posición ---
                    if (messageType === 'position' && data.payload.latitude && data.payload.longitude) {
                        const lat = data.payload.latitude / 10000000;
                        const lng = data.payload.longitude / 10000000;

                        // Prepara los datos de posición para la BD
                        updateData.position = [Number(lat.toFixed(6)), Number(lng.toFixed(6))]

                    }

                    // --- Lógica de NodeInfo (Información Estática) ---
                    if (messageType === 'nodeinfo' && data.payload.longName) {
                        const info = data.payload;
                        updateData = {
                            ...updateData,
                            shortName: info.shortName || null,
                            longName: info.longName || null,
                            firmwareVersion: info.firmwareVersion || null,
                        };
                    }

                    // 3. Persistencia (UPSERT)
                    // Se ejecuta si es 'position' o 'nodeinfo'
                    await db.insert(nodes).values({ id: nodeId, ...updateData }).onConflictDoUpdate({
                        target: nodes.id,
                        set: {
                            ...updateData
                        }
                    });

                    console.log(`[DB SUCCESS] Tipo: ${messageType}, Nodo ${nodeId} (${region}) actualizado.`);

                } else {
                    // Ignorar todos los demás tipos de paquetes (text, telemetry, etc.)
                    return;
                }
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
        throw new ORPCError("BAD_REQUEST", {cause: err})
    }
}