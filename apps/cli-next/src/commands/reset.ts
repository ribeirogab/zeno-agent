import { defineCommand } from 'citty';

import { ok } from '../lib/output.js';
import { reset } from '../lib/state.js';

export default defineCommand({
  meta: {
    name: 'reset',
    description: 'wipe preview state (mock-only)',
  },
  run() {
    reset();
    console.log(ok('preview state reset'));
  },
});
