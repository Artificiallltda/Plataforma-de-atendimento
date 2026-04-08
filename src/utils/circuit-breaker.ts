/**
 * Circuit Breaker Pattern
 * 
 * Protege chamadas a serviços externos (como Gemini API) de falhas em cascata.
 * 
 * Estados:
 * - CLOSED: Funcionamento normal
 * - OPEN: Circuito aberto, rejeita chamadas imediatamente
 * - HALF_OPEN: Testando se o serviço voltou
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export class CircuitOpenError extends Error {
  constructor(message = 'Circuit breaker is OPEN') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

interface CircuitBreakerOptions {
  failureThreshold?: number;
  timeout?: number;
  halfOpenMaxCalls?: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private nextAttempt = Date.now();
  private halfOpenCalls = 0;

  constructor(
    private readonly options: CircuitBreakerOptions = {}
  ) {
    this.options = {
      failureThreshold: 5,
      timeout: 60000, // 60 segundos
      halfOpenMaxCalls: 3,
      ...options
    };
  }

  getState(): CircuitState {
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new CircuitOpenError(
          `Circuit breaker is OPEN. Retry after ${new Date(this.nextAttempt).toISOString()}`
        );
      }
      // Transição para HALF_OPEN
      this.state = CircuitState.HALF_OPEN;
      this.halfOpenCalls = 0;
    }

    // Barreira no HALF_OPEN: limita chamadas simultâneas durante teste
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenCalls >= (this.options.halfOpenMaxCalls || 3)) {
        throw new CircuitOpenError(
          'Circuit breaker is HALF_OPEN and max test calls reached. Please retry later.'
        );
      }
      // Incrementa contador de chamadas em teste
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenCalls++;
      if (this.halfOpenCalls >= (this.options.halfOpenMaxCalls || 3)) {
        // Sucesso consistente, fechar o circuito
        this.reset();
      }
    } else {
      this.reset();
    }
  }

  private onFailure(): void {
    this.failures++;

    if (this.state === CircuitState.HALF_OPEN) {
      // Falha no half-open, voltar para OPEN
      this.trip();
    } else if (this.failures >= (this.options.failureThreshold || 5)) {
      // Limite de falhas atingido
      this.trip();
    }
  }

  private trip(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + (this.options.timeout || 60000);
    this.halfOpenCalls = 0;
  }

  private reset(): void {
    this.failures = 0;
    this.state = CircuitState.CLOSED;
    this.halfOpenCalls = 0;
  }
}

export default CircuitBreaker;
