/**
 * Memoria limitada dos ids de mensagem ja entregues por e-mail. O RabbitMQ e at-least-once: uma mensagem cujo
 * ack se perdeu volta e mandaria um segundo e-mail. So cobre reentregas vistas pelo mesmo processo -
 * mitigacao barata, nao exactly-once distribuido.
 */
export class RecentMessageIds {
  private readonly ids = new Set<string>();

  constructor(private readonly capacity: number) {}

  has(id: string): boolean {
    return this.ids.has(id);
  }

  add(id: string): void {
    this.ids.delete(id);
    this.ids.add(id);
    while (this.ids.size > this.capacity) {
      const oldest = this.ids.values().next().value as string;
      this.ids.delete(oldest);
    }
  }
}
