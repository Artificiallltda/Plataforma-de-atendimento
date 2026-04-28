/**
 * Helper único para apresentação de identificação do cliente.
 *
 * Resolve o problema de "Identificando..." aparecer mesmo quando há dados.
 * Tenta name -> phone -> channel_user_id -> ID curto, garantindo que o atendente
 * sempre veja algo útil ao invés de placeholder.
 */

interface CustomerLike {
  name?: string | null
  phone?: string | null
  channel_user_id?: string | null
}

interface TicketLike {
  id?: string | null
  customer_id?: string | null
  customer?: CustomerLike | CustomerLike[] | null
}

export function getCustomerLabel(ticket: TicketLike | null | undefined): string {
  if (!ticket) return 'Cliente'

  const raw = ticket.customer
  const customer = Array.isArray(raw) ? raw[0] : raw

  const name = customer?.name?.trim()
  if (name) return name

  const phone = customer?.phone?.trim()
  if (phone) return phone

  const channelUserId = customer?.channel_user_id?.trim()
  if (channelUserId) return `User ${channelUserId.slice(-6)}`

  const customerId = ticket.customer_id?.slice(0, 6)
  if (customerId) return `Cliente ${customerId}`

  const ticketId = ticket.id?.slice(0, 6)
  if (ticketId) return `Cliente #${ticketId}`

  return 'Cliente'
}

export function getCustomerSubLabel(ticket: TicketLike | null | undefined): string {
  if (!ticket) return ''
  const raw = ticket.customer
  const customer = Array.isArray(raw) ? raw[0] : raw
  return customer?.phone?.trim() || customer?.channel_user_id?.trim() || ''
}
