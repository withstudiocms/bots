import { ChannelType, type Client } from 'discord.js';
import { eq } from 'drizzle-orm';
import { ptalTable } from '../../db/schema.js';
import { useDB } from '../global/useDB.js';
import { useGitHub } from '../global/useGitHub.js';
import { makePtalEmbed } from './makePtalEmbed.js';

const editPtalMessage = async (data: typeof ptalTable.$inferSelect, client: Client) => {
	const octokit = await useGitHub();
	const db = useDB();

	const [pullReq, reviewList] = await Promise.all([
		octokit.rest.pulls.get({
			owner: data.owner,
			repo: data.repository,
			pull_number: data.pr,
		}),
		await octokit.rest.pulls.listReviews({
			owner: data.owner,
			repo: data.repository,
			pull_number: data.pr,
		}),
	]);

	const channel = await client.channels.fetch(data.channel, { cache: true });

	if (!channel || channel.type !== ChannelType.GuildText) return;

	const originalMessage = await channel.messages.fetch(data.message);

	const pullRequestUrl = new URL(
		`https://github.com/${data.owner}/${data.repository}/pull/${data.pr}`
	);

	const { edit } = await makePtalEmbed(
		pullReq.data,
		reviewList.data,
		data.description,
		pullRequestUrl,
		originalMessage.author,
		originalMessage.guild.id
	);

	await originalMessage.edit(edit);

	if (pullReq.data.merged) {
		await db.delete(ptalTable).where(eq(ptalTable.id, data.id));
	}
};

export { editPtalMessage };
