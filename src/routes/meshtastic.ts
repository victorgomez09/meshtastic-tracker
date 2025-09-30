import { os } from '@orpc/server'
import * as z from 'zod'
import { getAll } from '../services/mesthastic';

const PlanetSchema = z.object({
  id: z.number().int().min(1),
  name: z.string(),
  description: z.string().optional(),
})

export const listNode = os
  .handler(async () => {
    // your list code here
    return getAll();
  })

export const findNode = os
  .input(PlanetSchema.pick({ id: true }))
  .handler(async ({ input }) => {
    // your find code here
    return { id: 1, name: 'name' }
  }).actionable()


export const router = {
  meshtastic: {
    list: listNode,
    find: findNode,
  }
}