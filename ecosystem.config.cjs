module.exports = {
    apps: [{
        name: 'ghostai-x-bot',
        script: 'src/index.js',
        cwd: '/Users/danielcastillo/Projects/Websites/Bots/ghostai-x-bot',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '200M',
        env: {
            NODE_ENV: 'production'
        },
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        error_file: 'logs/error.log',
        out_file: 'logs/output.log',
        merge_logs: true,
    }]
};
