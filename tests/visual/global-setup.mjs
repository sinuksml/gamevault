import {startServer} from "../server.mjs";

export default async function globalSetup() {
  const server = await startServer();
  return async () => {
    await new Promise(resolve => server.close(resolve));
  };
}
