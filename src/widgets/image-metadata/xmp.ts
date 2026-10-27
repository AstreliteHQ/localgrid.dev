/** Reads the top-level properties of an XMP packet and edits them in place
 * through the DOM, so namespaces, structure and anything left untouched
 * survive a round trip. */

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'

/** text: a plain value. list: an rdf:Seq or rdf:Bag of plain values.
 * langAlt: an rdf:Alt of translations (only x-default is edited).
 * struct and resource: nested data or a URI, shown but not editable. */
export type XmpKind = 'text' | 'list' | 'langAlt' | 'struct' | 'resource'

export interface XmpProperty {
  /** Position in document order; stable for a given packet. */
  index: number
  /** Qualified name as written, like `dc:creator`. */
  name: string
  prefix: string
  namespace: string
  kind: XmpKind
  value: string
  editable: boolean
}

export const LIST_SEPARATOR = '; '

type PropertyNode = Attr | Element

function isAttribute(node: PropertyNode): node is Attr {
  return node.nodeType === 2
}

function parsePacket(packet: string): Document {
  const doc = new DOMParser().parseFromString(packet.replace(/\0+$/, '').trim(), 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('This XMP packet is not valid XML.')
  return doc
}

function elementChildren(element: Element): Element[] {
  return Array.from(element.children)
}

function isRdf(node: Element, localName: string): boolean {
  return node.namespaceURI === RDF_NS && node.localName === localName
}

function collectProperties(doc: Document): PropertyNode[] {
  const rdf = doc.getElementsByTagNameNS(RDF_NS, 'RDF')[0]
  if (!rdf) return []
  const nodes: PropertyNode[] = []
  for (const description of elementChildren(rdf).filter((child) => isRdf(child, 'Description'))) {
    for (const attribute of Array.from(description.attributes)) {
      if (attribute.namespaceURI === XMLNS_NS || attribute.namespaceURI === RDF_NS) continue
      if (attribute.namespaceURI === XML_NS || attribute.name.startsWith('xmlns')) continue
      nodes.push(attribute)
    }
    nodes.push(...elementChildren(description))
  }
  return nodes
}

function container(element: Element): Element | null {
  return elementChildren(element).find((child) => ['Alt', 'Seq', 'Bag'].some((name) => isRdf(child, name))) ?? null
}

function items(list: Element): Element[] {
  return elementChildren(list).filter((child) => isRdf(child, 'li'))
}

function defaultItem(alt: Element): Element | null {
  const all = items(alt)
  return all.find((item) => item.getAttributeNS(XML_NS, 'lang') === 'x-default') ?? all[0] ?? null
}

function collapse(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/** Leaf values of a nested structure, as `field: value` pairs. */
function flatten(element: Element): string {
  const parts: string[] = []
  const walk = (node: Element) => {
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.namespaceURI === XMLNS_NS || attribute.namespaceURI === RDF_NS) continue
      if (attribute.name.startsWith('xmlns')) continue
      parts.push(`${attribute.localName}: ${attribute.value}`)
    }
    const children = elementChildren(node)
    if (children.length === 0) {
      const text = collapse(node.textContent)
      if (text && node.namespaceURI !== RDF_NS) parts.push(`${node.localName}: ${text}`)
      else if (text) parts.push(text)
    }
    children.forEach(walk)
  }
  elementChildren(element).forEach(walk)
  return parts.join(', ')
}

function describe(node: PropertyNode): Pick<XmpProperty, 'kind' | 'value' | 'editable'> {
  if (isAttribute(node)) return { kind: 'text', value: node.value, editable: true }
  const resource = node.getAttributeNS(RDF_NS, 'resource')
  if (resource !== null && resource !== '') return { kind: 'resource', value: resource, editable: false }
  const list = container(node)
  if (list) {
    const simple = items(list).every((item) => item.children.length === 0)
    if (isRdf(list, 'Alt')) {
      const item = defaultItem(list)
      return { kind: 'langAlt', value: collapse(item?.textContent ?? ''), editable: simple }
    }
    if (simple) {
      const values = items(list).map((item) => collapse(item.textContent))
      return { kind: 'list', value: values.join(LIST_SEPARATOR), editable: true }
    }
    return { kind: 'struct', value: flatten(node), editable: false }
  }
  if (node.children.length > 0 || node.getAttributeNS(RDF_NS, 'parseType') === 'Resource') {
    return { kind: 'struct', value: flatten(node), editable: false }
  }
  return { kind: 'text', value: node.textContent ?? '', editable: true }
}

export function parseXmp(packet: string): XmpProperty[] {
  return collectProperties(parsePacket(packet)).map((node, index) => ({
    index,
    name: node.prefix ? `${node.prefix}:${node.localName}` : node.localName,
    prefix: node.prefix ?? '',
    namespace: node.namespaceURI ?? '',
    ...describe(node),
  }))
}

export function splitXmpList(text: string): string[] {
  return text
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
}

function setValue(node: PropertyNode, text: string) {
  if (isAttribute(node)) {
    node.value = text
    return
  }
  const list = container(node)
  if (!list) {
    node.textContent = text
    return
  }
  if (isRdf(list, 'Alt')) {
    const item = defaultItem(list)
    if (item) item.textContent = text
    return
  }
  const doc = node.ownerDocument
  const qualifiedName = list.prefix ? `${list.prefix}:li` : 'li'
  // Keep the packet's own indentation style by reusing the whitespace
  // that preceded the first item, if any.
  const indent = items(list)[0]?.previousSibling
  const whitespace = indent?.nodeType === 3 ? indent.textContent : null
  while (list.firstChild) list.removeChild(list.firstChild)
  for (const value of splitXmpList(text)) {
    if (whitespace) list.appendChild(doc.createTextNode(whitespace))
    const item = doc.createElementNS(RDF_NS, qualifiedName)
    item.textContent = value
    list.appendChild(item)
  }
}

function remove(node: PropertyNode) {
  if (isAttribute(node)) {
    node.ownerElement?.removeAttributeNode(node)
    return
  }
  const previous = node.previousSibling
  if (previous?.nodeType === 3 && !previous.textContent?.trim()) previous.remove()
  node.remove()
}

/** Applies edits by property index and returns the new packet, or `null`
 * once no property is left (the whole packet should go). */
export function editXmp(packet: string, values: Map<number, string>, removed: Set<number>): string | null {
  const doc = parsePacket(packet)
  const nodes = collectProperties(doc)
  nodes.forEach((node, index) => {
    if (removed.has(index)) remove(node)
    else if (values.has(index)) setValue(node, values.get(index) ?? '')
  })
  if (collectProperties(doc).length === 0) return null
  return new XMLSerializer().serializeToString(doc)
}
