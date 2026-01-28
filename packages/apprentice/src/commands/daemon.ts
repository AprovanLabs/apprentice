import { AgentDaemon } from '../daemon';

export async function daemonCommand() {
  const daemon = new AgentDaemon();
  await daemon.start();
}
