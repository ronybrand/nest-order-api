import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Handlebars from 'handlebars';
import { OrderStatusChangedEvent } from '../order/order-status-changed.event';

/**
 * Renderiza o template `order-status-changed.hbs` via Handlebars: o HTML fica num arquivo
 * separado do código, não embutido em string. O template é compilado uma vez e cacheado.
 */
const templatePath = join(__dirname, 'templates', 'order-status-changed.hbs');
const compiledTemplate = Handlebars.compile(readFileSync(templatePath, 'utf-8'));

export function buildOrderStatusEmailHtml(event: OrderStatusChangedEvent): string {
  return compiledTemplate({
    customerName: event.customerName,
    oldStatus: event.oldStatus,
    newStatus: event.newStatus,
    isConfirmed: event.newStatus === 'CONFIRMED',
    isCanceled: event.newStatus === 'CANCELED',
    shortOrderId: event.orderId.slice(0, 8).toUpperCase(),
    changedAt: new Date(event.changedAt).toISOString(),
    totalAmount: event.totalAmount,
  });
}
