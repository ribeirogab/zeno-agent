import { defineCommand } from 'citty';
import create from './profile-create.js';
import del from './profile-delete.js';
import edit from './profile-edit.js';
import list from './profile-list.js';
import show from './profile-show.js';
import use from './profile-use.js';

export default defineCommand({
  meta: {
    name: 'profile',
    description: 'manage profiles (create, edit, delete, list, switch)',
  },
  subCommands: {
    create,
    list,
    show,
    edit,
    delete: del,
    use,
  },
});
