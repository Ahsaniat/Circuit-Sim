import { defineConfig } from 'vitest/config';

// Single-fork execution keeps local runs light on this machine (a faulty
// battery makes sustained multi-core load risky) while remaining valid in CI.
export default defineConfig({
    test: {
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
        maxWorkers: 1,
        minWorkers: 1,
    },
});
