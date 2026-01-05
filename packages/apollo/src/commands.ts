import { type ChatInputCommandInteraction, Collection, type SlashCommandBuilder } from 'discord.js';
import ptal from './commands/ptal.js';
import settings from './commands/settings.js';
import solved from './commands/solved.js';
import support from './commands/support.js';

export type Command = {
	builder: SlashCommandBuilder;
	// biome-ignore lint/suspicious/noExplicitAny: this is fine
	execute: (interaction: ChatInputCommandInteraction) => Promise<any>;
};

const commands = new Collection<string, Command>();

commands.set(solved.builder.name, solved);
commands.set(settings.builder.name, settings);
commands.set(support.builder.name, support);
commands.set(ptal.builder.name, ptal);

export { commands };
