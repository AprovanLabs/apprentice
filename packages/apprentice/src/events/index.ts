/**
 * Event Management
 *
 * Events represent point-in-time occurrences (shell commands, chat messages,
 * file changes) with flexible metadata and links to assets.
 */

export { insertEvent, insertEvents, generateEventId } from './insert';
export type { EventInput } from './insert';
