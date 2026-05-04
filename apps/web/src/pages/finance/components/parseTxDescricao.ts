/**
 * Parser de descrições de transações importadas do Nubank.
 *
 * Extrai do texto monolítico (`Transferência enviada pelo Pix - UBER ... -
 * 17.895.646/0001-87 - EBANX IP LTDA. (0383) Agência: 1 Conta: ...`) três
 * partes que importam pra tela de Lançamentos: tipo, nome real e CPF/CNPJ.
 * Resto (instituição, agência, conta) é descartado — não é informação útil
 * pro usuário, só ruído visual do extrato.
 *
 * Padrões do Nubank cobertos:
 *  - "Transferência enviada pelo Pix - {NOME} - {CPF/CNPJ} - {INST} ..."
 *  - "Transferência recebida pelo Pix - {NOME} - {CPF/CNPJ} - {INST} ..."
 *  - "Transferência enviada pelo Pix - {NOME} (Transferência enviada)"
 *  - "Compra no débito via NuPay - {LOJA}"
 *  - "Compra no débito - {LOJA}"
 *  - "Pagamento de boleto"
 *  - "Pagamento de fatura"
 *
 * Pra descrições não-Nubank (digitadas à mão: "Churrasco", "WHOISEE", etc),
 * cai no fallback: tipo=null, nome=descrição original, doc=null.
 */

export interface ParsedDescricao {
  /** Etiqueta curta do tipo de movimentação ("PIX ENVIADO", "DÉBITO", etc).
   *  Null quando a descrição não bate em nenhum padrão conhecido. */
  tipo: string | null
  /** Nome real da contraparte ou descrição livre. */
  nome: string
  /** CPF/CNPJ formatado, quando o extrato traz (Pix). Null caso contrário. */
  doc: string | null
}

// CPF: 000.000.000-00 ou •••.000.000-•• (mascarado — Nubank usa bullet U+2022,
// não asterisco; aceita os dois pra robustez)
// CNPJ: 00.000.000/0000-00
const DOC_RE = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}|[•*]{3}\.\d{3}\.\d{3}-[•*]{2})/

/** Remove prefixo numérico que o Nubank às vezes coloca antes do nome
 *  ("57.075.532 CARLOS HENRIQUE" → "CARLOS HENRIQUE"). */
function stripLeadingNumericPrefix(name: string): string {
  // Só remove se houver letra depois — protege casos legítimos tipo "1 Conta"
  return name.replace(/^[\d\.\s]+(?=[A-Za-zÀ-ÿ])/, '').trim()
}

export function parseTxDescricao(desc: string | null | undefined): ParsedDescricao {
  if (!desc) return { tipo: null, nome: '', doc: null }
  const raw = desc.trim()

  // Pix (enviada/recebida)
  let m = raw.match(/^Transfer[êe]ncia (enviada|recebida) pelo Pix\s*-\s*(.+)$/i)
  if (m) {
    const tipo = m[1].toLowerCase() === 'enviada' ? 'PIX ENVIADO' : 'PIX RECEBIDO'
    const rest = m[2]
    const docMatch = rest.match(DOC_RE)
    if (docMatch) {
      const idx = rest.indexOf(docMatch[0])
      const nameRaw = rest.slice(0, idx).replace(/\s*-\s*$/, '').trim()
      return { tipo, nome: stripLeadingNumericPrefix(nameRaw), doc: docMatch[0] }
    }
    // Variante sem doc: "NOME (Transferência enviada)" ou só "NOME"
    const nome = rest.replace(/\s*\([^)]*\)\s*$/, '').trim()
    return { tipo, nome: stripLeadingNumericPrefix(nome), doc: null }
  }

  m = raw.match(/^Compra no d[ée]bito via NuPay\s*-\s*(.+)$/i)
  if (m) return { tipo: 'NUPAY', nome: m[1].trim(), doc: null }

  m = raw.match(/^Compra no d[ée]bito\s*-\s*(.+)$/i)
  if (m) return { tipo: 'DÉBITO', nome: m[1].trim(), doc: null }

  m = raw.match(/^Pagamento de boleto\s*-?\s*(.*)$/i)
  if (m) return { tipo: 'BOLETO', nome: m[1].trim() || '—', doc: null }

  if (/^Pagamento de fatura/i.test(raw)) {
    // Preserva o texto original como nome — descartar pra "—" perdia
    // contexto. Tipo FATURA + nome "Pagamento de fatura" é meio redundante,
    // mas a redundância documenta o que aconteceu sem ambiguidade.
    return { tipo: 'FATURA', nome: raw, doc: null }
  }

  // Fallback: descrição não-Nubank (livre)
  return { tipo: null, nome: raw, doc: null }
}
