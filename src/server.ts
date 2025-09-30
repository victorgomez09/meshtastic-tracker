import { RPCHandler } from '@orpc/server/node';
import { CORSPlugin } from '@orpc/server/plugins';
import { createServer } from 'node:http'; // or 'node:http2'
import { router } from './routes';
import { startMqttClient } from './services/mesthastic';

const handler = new RPCHandler(router, {
  plugins: [
    new CORSPlugin()
  ]
})

const server = createServer(async (req, res) => {
  const { matched } = await handler.handle(req, res, {
    prefix: '/rpc',
    context: {} // Provide initial context if needed
  })

  if (matched) {
    return
  }

  res.statusCode = 404
  res.end('Not found')
})

server.listen(3001, '127.0.0.1', () => {
  console.log('Listening on 127.0.0.1:3001');
  // startMqttClient()
})