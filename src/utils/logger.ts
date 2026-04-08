/**
 * Logger estruturado para PAA
 * 
 * Produção: JSON formatado para integração com serviços de log
 * Desenvolvimento: Colorido e legível
 */

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  service: string;
  metadata?: Record<string, unknown>;
  error?: Error;
}

const isProduction = process.env.NODE_ENV === 'production';

class PaaLogger {
  private service = 'paa-api';

  private format(entry: LogEntry): string {
    // Serializa erro corretamente para JSON
    const serializedError = entry.error ? {
      message: entry.error.message,
      stack: entry.error.stack,
      name: entry.error.name
    } : undefined;

    if (isProduction) {
      return JSON.stringify({
        ...entry,
        error: serializedError,
        timestamp: new Date().toISOString()
      });
    }

    const colors: Record<string, string> = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m',  // green
      warn: '\x1b[33m',  // yellow
      error: '\x1b[31m', // red
      reset: '\x1b[0m'
    };

    const color = colors[entry.level] || colors.reset;
    const prefix = `${color}[${entry.level.toUpperCase()}]${colors.reset}`;
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    
    let output = `${prefix} [${timestamp}] ${entry.message}`;
    
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      output += `\n  ${JSON.stringify(entry.metadata, null, 2)}`;
    }
    
    if (serializedError) {
      output += `\n  Error: ${serializedError.message}`;
      if (serializedError.stack && !isProduction) {
        output += `\n  Stack: ${serializedError.stack}`;
      }
    }

    return output;
  }

  private log(level: LogEntry['level'], message: string, metadata?: Record<string, unknown>, error?: Error) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: this.service,
      metadata: this.sanitize(metadata || {}),
      error
    };

    // eslint-disable-next-line no-console
    console.log(this.format(entry));
  }

  private sanitize(obj: Record<string, unknown>): Record<string, unknown> {
    const sensitive = ['password', 'token', 'api_key', 'secret', 'authorization', 'key', 'credential'];
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (sensitive.some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  debug(message: string, metadata?: Record<string, unknown>) {
    if (!isProduction) {
      this.log('debug', message, metadata);
    }
  }

  info(message: string, metadata?: Record<string, unknown>) {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>, error?: Error) {
    this.log('warn', message, metadata, error);
  }

  error(message: string, error?: Error, metadata?: Record<string, unknown>) {
    this.log('error', message, metadata, error);
  }
}

export const logger = new PaaLogger();
export default logger;
