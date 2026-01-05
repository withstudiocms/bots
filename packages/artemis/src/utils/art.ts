/**
 * Multi-line ASCII art branding string for the Artemis package.
 *
 * This exported constant contains a boxed ASCII-art banner (including a stylized
 * project name and the repository URL) intended for display in console output,
 * CLI banners, or log headers. It is stored as a template literal to preserve
 * exact whitespace and line breaks.
 *
 * Usage:
 * - Import the constant and write it to stdout or a log to display the banner.
 *
 * Example:
 * ```ts
 * import { BRAND_ART } from './utils/art';
 * console.log(BRAND_ART);
 * ```
 *
 * Notes:
 * - Keep the value as a template literal to ensure the art renders correctly.
 * - Do not trim or modify whitespace if preserving visual alignment is required.
 *
 * @public
 * @see https://github.com/withstudiocms/artemis
 */
export const BRAND_ART = `
.---------------------------------------------------------------.
|     █████╗ ██████╗ ████████╗███████╗███╗   ███╗██╗███████╗    |
|    ██╔══██╗██╔══██╗╚══██╔══╝██╔════╝████╗ ████║██║██╔════╝    |
|    ███████║██████╔╝   ██║   █████╗  ██╔████╔██║██║███████╗    |
|    ██╔══██║██╔══██╗   ██║   ██╔══╝  ██║╚██╔╝██║██║╚════██║    |
|    ██║  ██║██║  ██║   ██║   ███████╗██║ ╚═╝ ██║██║███████║    |
|    ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝     ╚═╝╚═╝╚══════╝    |
|                                                               |
|           https://github.com/withstudiocms/artemis            |
'---------------------------------------------------------------'
`;
