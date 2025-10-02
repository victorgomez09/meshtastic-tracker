import { nodesCreateSchema } from '../models';
import { z } from 'zod';

export type NodeUpdate = z.infer<typeof nodesCreateSchema>;
export type DrizzleUpsertData = Required<Pick<NodeUpdate, 'id' | 'lastSeen'>> & Partial<Omit<NodeUpdate, 'id' | 'lastSeen'>>;

/**
 * Converts Meshtastic integer coordinates (degrees * 10^7) to a GeoJSON Point string (WKT).
 *
 * @param latitudeI The integer latitude (from decodedPayload.latitudeI)
 * @param longitudeI The integer longitude (from decodedPayload.longitudeI)
 * @returns A GeoJSON-compatible object required by Drizzle's geometry type.
 */
export function convertToGeoJsonPoint(latitudeI: number, longitudeI: number): [number, number] {
    // Meshtastic integer coordinates are degrees * 10^7
    const lat = latitudeI / 10000000;
    const lon = longitudeI / 10000000;

    return [lon, lat];
}

// The Meshtastic Position payload contains position data
export function transformPositionToNodeUpdate(
    nodeId: number, 
    positionPayload: any
): DrizzleUpsertData { // Usamos el nuevo tipo
    
    const idString = nodeId.toString(16);
    const result: DrizzleUpsertData = { 
        id: idString, 
        lastSeen: new Date(), // Siempre requerido y actualizado
    };

    // Si la posición es válida (no es 0, 0), la incluimos
    if (positionPayload.latitudeI !== 0 || positionPayload.longitudeI !== 0) {
        result.position = convertToGeoJsonPoint(
            positionPayload.latitudeI, 
            positionPayload.longitudeI
        );
    }
    
    return result;
}

// The Meshtastic User/NodeInfo payload contains metadata
export function transformUserToNodeUpdate(
    nodeId: number, 
    userPayload: any
): DrizzleUpsertData {

    return {
        id: nodeId.toString(16),
        lastSeen: new Date(),
        // Map Meshtastic fields to your Drizzle fields
        shortName: userPayload.shortName,
        longName: userPayload.longName,
        region: userPayload.region, // This might need further mapping if your 'region' is a custom type
        // firmwareVersion is often found in the User.hwModel field or other related fields
        // For simplicity, we'll map the main ones
    };
}