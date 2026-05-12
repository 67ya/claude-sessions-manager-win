#!/bin/bash
# Start Claude Sessions Manager via systemd user service
set -e

echo "=== Claude Sessions Manager ==="
systemctl --user daemon-reload
systemctl --user enable --now claude-sessions
sleep 2
systemctl --user status claude-sessions --no-pager -l
echo ""
echo "Local:  http://localhost:3457"
echo "LAN:    http://$(hostname -I | awk '{print $1}'):3457"
echo ""
echo "Logs:   journalctl --user -u claude-sessions -f"
echo "Deploy: /home/ctyun/apps/claude-sessions-manager/deploy.sh"
