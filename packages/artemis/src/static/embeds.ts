import { DiscordEmbedBuilder, EMBED_BRAND_COLOR } from '../utils/embed-builder.ts';

/**
 * Creates and returns a new DiscordEmbedBuilder preconfigured with the project's brand color.
 *
 * This helper produces a fresh DiscordEmbedBuilder instance with its color set to
 * EMBED_BRAND_COLOR, allowing callers to chain further customization (title,
 * description, fields, footer, etc.) before sending the embed.
 *
 * @returns {DiscordEmbedBuilder} A new embed builder with EMBED_BRAND_COLOR applied.
 */
export const getBrandedEmbedBase = (): DiscordEmbedBuilder =>
	new DiscordEmbedBuilder().setColor(EMBED_BRAND_COLOR);

/**
 * Builds an embed describing how to contribute to StudioCMS.
 *
 * The embed contains a title, descriptive text, a thumbnail (constructed from the provided botDomain),
 * three informative fields linking to relevant GitHub issues and documentation ("Good First Issues",
 * "Help Wanted", and "Getting Started"), and a celebratory footer.
 *
 * @param botDomain - Host or domain used to construct the thumbnail URL. The value will be prefixed with "https://"
 *                    when building the thumbnail (for example: "mybot.example.com" results in "https://mybot.example.com/studiocms.png").
 * @returns The fully built embed object (produced by brandedEmbedBase.build()), ready to be sent in a message.
 */
export const contributing = (botDomain: string) =>
	getBrandedEmbedBase()
		.setTitle('Contributing to StudioCMS')
		.setDescription(
			'Help make StudioCMS better! Here are some ways to get started with contributing:'
		)
		.setThumbnail(`https://${botDomain}/studiocms.png`)
		.addFields([
			{
				name: '🌱 Good First Issues',
				value:
					'[Browse all good first issues →](https://github.com/withstudiocms/studiocms/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)',
			},
			{
				name: '🙋 Help Wanted',
				value:
					'[Browse all help wanted issues →](https://github.com/withstudiocms/studiocms/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)',
			},
			{
				name: '📚 Getting Started',
				value:
					'• [Contributing Guide](https://github.com/withstudiocms/studiocms?tab=contributing-ov-file)\n• [Development Setup](https://github.com/withstudiocms/studiocms?tab=readme-ov-file#getting-started-with-our-development-playground)',
			},
		])
		.setFooter('Apollo, we have another contributor! 🚀')
		.build();

export const getStarHistoryEmbed = (repository: string, svgUrl: string) =>
	new DiscordEmbedBuilder()
		.setTitle(`⭐ Star History for ${repository}`)
		.setColor(0x3b82f6) // Blue color
		.setImage(svgUrl)
		.setURL(svgUrl)
		.setFooter('Data generated using star-history.com')
		.setTimestamp()
		.setAuthor({
			icon_url: 'https://www.star-history.com/assets/icon.png',
			name: 'Star History',
			url: 'https://www.star-history.com/',
		})
		.build();
