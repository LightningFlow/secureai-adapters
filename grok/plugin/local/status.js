#!/usr/bin/env node
'use strict';
// Grok local status: prints what SecureAI Core says about Grok. Never decides it.
const path = require('path');
const fs = require('fs');

function lib(name) {
  const built = path.join(__dirname, '..', 'lib', name);
  return require(fs.existsSync(built) ? built : path.join(__dirname, '..', '..', 'shared', name));
}
const { withCore, describe, explainError } = lib('secureai-core.js');

withCore('grok', (c) => c.status())
  .then((s) => {
    const mine = (s.statuses || []).find((x) => x.platform === 'grok');
    console.log(
      JSON.stringify({
        platform: 'grok',
        state: mine ? mine.state : 'unknown',
        summary: describe(mine),
        protected_truth: 'core_only',
      })
    );
  })
  .catch((e) => {
    console.log(JSON.stringify({ platform: 'grok', state: 'unknown', summary: explainError(e) }));
  });
