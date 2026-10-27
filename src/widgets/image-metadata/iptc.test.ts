import { describe, expect, it } from 'vitest'
import {
  declaresUtf8,
  formatIptcValue,
  iptcDatasetName,
  parseIptc,
  parsePhotoshopResources,
  photoshopResourceName,
  serializeIptc,
  serializePhotoshopResources,
} from './iptc'
import { samplePhotoshop } from './testImages'

describe('Photoshop resources', () => {
  it('round trips, including odd sizes and names', () => {
    const resources = [
      { id: 0x0404, name: Uint8Array.of(0x41), data: Uint8Array.of(1, 2, 3) },
      { id: 0x03ed, name: new Uint8Array(0), data: new Uint8Array(16) },
    ]
    expect(parsePhotoshopResources(serializePhotoshopResources(resources))).toEqual(resources)
  })

  it('names the common resources', () => {
    expect(photoshopResourceName(0x040c)).toBe('PhotoshopThumbnail')
    expect(photoshopResourceName(0x1234)).toBe('Resource 0x1234')
  })
})

describe('IPTC datasets', () => {
  it('reads the sample block', () => {
    const iptc = parsePhotoshopResources(samplePhotoshop()).find((resource) => resource.id === 0x0404)!
    const datasets = parseIptc(iptc.data)
    expect(declaresUtf8(datasets)).toBe(true)
    expect(datasets.map((item) => iptcDatasetName(item.record, item.dataset))).toEqual([
      'CodedCharacterSet',
      'ApplicationRecordVersion',
      'Caption-Abstract',
      'Keywords',
      'Keywords',
      'City',
    ])
    expect(formatIptcValue(datasets[0], true)).toBe('UTF-8')
    expect(formatIptcValue(datasets[1], true)).toBe('4')
    expect(formatIptcValue(datasets[2], true)).toBe('Sunset over the Seine')
  })

  it('round trips extended datasets larger than 32 KB', () => {
    const datasets = [{ record: 2, dataset: 120, value: new Uint8Array(40000).fill(65) }]
    expect(parseIptc(serializeIptc(datasets))).toEqual(datasets)
  })

  it('decodes text as Latin-1 when no charset is declared', () => {
    const dataset = { record: 2, dataset: 90, value: Uint8Array.of(0x4d, 0xfc, 0x6e) }
    expect(formatIptcValue(dataset, false)).toBe('Mün')
  })
})
