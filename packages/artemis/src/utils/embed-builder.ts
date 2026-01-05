import type { Discord } from 'dfx/index';
import type { Mutable } from 'effect/Types';

/**
 * Brand color used for embed messages.
 *
 * Numeric hex color constant (0xA581F3) intended for use with embed builders that accept
 * a numeric color value (e.g., Discord.js's MessageEmbed.setColor or similar utilities).
 *
 * @example
 * // TypeScript
 * embed.setColor(EMBED_BRAND_COLOR);
 *
 * @remarks
 * Keep this value in sync with the project's visual identity / brand palette.
 */
export const EMBED_BRAND_COLOR = 0xa581f3;

/**
 * Fluent builder for constructing Discord.RichEmbed objects.
 *
 * Provides a chainable API for incrementally setting common embed properties such as
 * title, description, author, url, color, thumbnail, image, video, footer, timestamp and fields.
 * The builder accumulates fields passed via addField/addFields and applies them when build() is called.
 *
 * Example:
 * ```
 * const embed = new DiscordEmbedBuilder()
 *   .setTitle("Server status")
 *   .setDescription("All systems operational")
 *   .setColor(0x00ff00)
 *   .addField({ name: "Uptime", value: "72h", inline: true })
 *   .setFooter("Bot", "https://example.com/icon.png")
 *   .setTimestamp()
 *   .build();
 * ```
 *
 * Notes:
 * - All setter methods are chainable and return `this` so calls can be chained.
 * - The internal representation is a mutable Discord.RichEmbed-like object; build() returns a `Discord.RichEmbed`.
 *
 * Public API summary:
 * - setTitle(title: string): this
 *   Set the embed title.
 *
 * - setDescription(description: string): this
 *   Set the embed description.
 *
 * - setAuthor(author: Discord.RichEmbedAuthor): this
 *   Set the embed author object (name, url, icon_url).
 *
 * - setURL(url: string): this
 *   Set the embed URL (makes the title a hyperlink).
 *
 * - setColor(color: number): this
 *   Set the embed color as a decimal number (e.g. 0xff0000).
 *
 * - addField(field: Discord.RichEmbedField): this
 *   Append a single field to the embed. Field shape: { name, value, inline? }.
 *
 * - addFields(fields: Discord.RichEmbedField[]): this
 *   Append multiple fields to the embed.
 *
 * - setThumbnail(url: string): this
 *   Set the embed thumbnail by URL.
 *
 * - setFooter(text: string, icon_url?: string): this
 *   Set the embed footer text and optional icon URL.
 *
 * - setImage(url: string): this
 *   Set the main image of the embed by URL.
 *
 * - setTimestamp(timestamp: Date = new Date()): this
 *   Set the embed timestamp. Defaults to the current time if no Date is provided.
 *   The timestamp is stored as an ISO 8601 string.
 *
 * - setVideo(url: string): this
 *   Set the embed video URL (where supported).
 *
 * - build(): Discord.RichEmbed
 *   Finalize and return the constructed embed. If any fields were added via addField/addFields,
 *   they are assigned to the embed's `fields` property before returning.
 *
 * @public
 */
export class DiscordEmbedBuilder {
	private embed: Mutable<Discord.RichEmbed> = {};
	private fieldsToAdd: Discord.RichEmbedField[] = [];

	setTitle(title: string) {
		this.embed.title = title;
		return this;
	}

	setDescription(description: string) {
		this.embed.description = description;
		return this;
	}

	setAuthor(author: Discord.RichEmbedAuthor) {
		this.embed.author = author;
		return this;
	}

	setURL(url: string) {
		this.embed.url = url;
		return this;
	}

	setColor(color: number) {
		this.embed.color = color;
		return this;
	}

	addField(field: Discord.RichEmbedField) {
		this.fieldsToAdd.push(field);
		return this;
	}

	addFields(fields: Discord.RichEmbedField[]) {
		this.fieldsToAdd.push(...fields);
		return this;
	}

	setThumbnail(url: string) {
		this.embed.thumbnail = { url };
		return this;
	}

	setFooter(text: string, icon_url?: string) {
		this.embed.footer = { text, icon_url };
		return this;
	}

	setImage(url: string) {
		this.embed.image = { url };
		return this;
	}

	setTimestamp(timestamp: Date = new Date()) {
		this.embed.timestamp = timestamp.toISOString();
		return this;
	}

	setVideo(url: string) {
		this.embed.video = { url };
		return this;
	}

	build(): Discord.RichEmbed {
		if (this.fieldsToAdd.length > 0) {
			this.embed.fields = this.fieldsToAdd;
		}
		return this.embed;
	}
}
