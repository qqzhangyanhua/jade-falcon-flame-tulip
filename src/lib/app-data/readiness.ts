"use server";

export type ConnectorReadiness = { ready: boolean };

export async function getConnectorReadiness(): Promise<ConnectorReadiness> {
  const { isConnectorTokenReady } = await import("./client.server");
  return { ready: isConnectorTokenReady() };
}
