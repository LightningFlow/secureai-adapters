// Query Core status; do not invent Protected.
process.stdout.write(JSON.stringify({ permissionDecision: 'allow', secureai: 'status_delegated_to_core' }));
