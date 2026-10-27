import { describe, expect, it } from 'vitest'
import { editXmp, parseXmp } from './xmp'
import { SAMPLE_XMP } from './testImages'

describe('parseXmp', () => {
  it('lists attribute and element properties with their kind', () => {
    expect(parseXmp(SAMPLE_XMP).map(({ name, kind, value }) => ({ name, kind, value }))).toEqual([
      { name: 'xmp:CreatorTool', kind: 'text', value: 'Lightroom' },
      { name: 'exif:GPSLatitude', kind: 'text', value: '48,51.494N' },
      { name: 'dc:title', kind: 'langAlt', value: 'Eiffel Tower' },
      { name: 'dc:subject', kind: 'list', value: 'paris; travel' },
      { name: 'xmp:Rating', kind: 'text', value: '4' },
    ])
  })

  it('shows nested structures read-only', () => {
    const packet = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:Description xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/">
        <Iptc4xmpCore:CreatorContactInfo rdf:parseType="Resource">
          <Iptc4xmpCore:CiEmailWork>me@example.com</Iptc4xmpCore:CiEmailWork>
        </Iptc4xmpCore:CreatorContactInfo>
      </rdf:Description></rdf:RDF></x:xmpmeta>`
    const [property] = parseXmp(packet)
    expect(property).toMatchObject({ kind: 'struct', editable: false, value: 'CiEmailWork: me@example.com' })
  })

  it('rejects broken XML', () => {
    expect(() => parseXmp('<x:xmpmeta')).toThrow(/not valid XML/)
  })
})

describe('editXmp', () => {
  it('edits text, attributes, translations and lists in place', () => {
    const edited = editXmp(
      SAMPLE_XMP,
      new Map([
        [0, 'darktable'],
        [2, 'Tour Eiffel'],
        [3, 'paris; night; ; tower'],
        [4, '5'],
      ]),
      new Set(),
    )!
    expect(edited).toContain('<?xpacket begin=')
    expect(parseXmp(edited).map((property) => property.value)).toEqual([
      'darktable',
      '48,51.494N',
      'Tour Eiffel',
      'paris; night; tower',
      '5',
    ])
  })

  it('removes properties and returns null once none are left', () => {
    const edited = editXmp(SAMPLE_XMP, new Map(), new Set([1, 3]))!
    expect(parseXmp(edited).map((property) => property.name)).toEqual(['xmp:CreatorTool', 'dc:title', 'xmp:Rating'])
    expect(editXmp(SAMPLE_XMP, new Map(), new Set([0, 1, 2, 3, 4]))).toBeNull()
  })
})
