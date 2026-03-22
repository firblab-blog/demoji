export interface CliOptions {
  args: string[];
}

export function parseArgs(args: string[]): CliOptions {
  return { args };
}

export async function runCli(args: string[]): Promise<number> {
  const options = parseArgs(args);
  const target = options.args[0] ?? '.';

  process.stdout.write(`demoji CLI scaffold ready. Target: ${target}\n`);
  process.stdout.write('Implementation pending.\n');

  return 0;
}
