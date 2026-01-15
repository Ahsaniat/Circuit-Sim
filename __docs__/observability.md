# Observability and Logging

## Log Format
Structured JSON logs with the following schema:
```typescript
{
  timestamp: string;     // ISO-8601
  level: string;         // debug, info, warn, error
  service: string;       // "circuitsim-web"
  request_id?: string;   // Correlation ID for user session
  action: string;        // Action being performed
  msg: string;           // Human-readable message
  details?: object;      // Additional context
}
```

## Agent Actions Log
Location: `logs/agent.log`

All agent actions are logged with reproducible steps. Each log entry includes:
- Exact timestamp
- Action performed
- Target files/systems
- Status (started/success/fail)
- Reproduction steps
- References to modified files

## Client-Side Logging
The web application logs:
- Compilation errors (with line/column info)
- Render failures
- User interactions (component drag, wire connection)
- Performance metrics (render time, frame rate)

## Error Tracking
Errors are categorized:
- **Compilation errors**: DSL syntax/semantic errors
- **Runtime errors**: Canvas rendering, geometry calculation failures
- **User errors**: Invalid component placements, snap failures

## Performance Monitoring
Track:
- Compilation time
- Render time per frame
- Number of components/wires
- Snap calculation time
- Canvas size and DPI

## Alerting Thresholds
- Compilation time > 500ms (complex circuits)
- Render time > 16ms (drops below 60 FPS)
- Snap calculation > 50ms (indicates geometry issues)

## Log Retention
- Agent logs: Persistent in repo (logs/agent.log)
- Client console logs: Session-only
- CI logs: 90 days retention

## Example Queries
Search compilation errors:
```bash
grep '"action":"compile"' logs/agent.log | grep '"status":"fail"'
```

Find performance issues:
```bash
grep '"render_time_ms"' logs/agent.log | awk -F'"render_time_ms":' '{print $2}' | awk -F',' '{if($1>16) print}'
```
