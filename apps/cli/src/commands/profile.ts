import { defineCommand } from 'citty';
import list from './profile-list.js';
import show from './profile-show.js';
import use from './profile-use.js';

export default defineCommand({
  meta: { name: 'profile', description: 'switch profile / inspect selection' },
  subCommands: { use, show, list },
});
