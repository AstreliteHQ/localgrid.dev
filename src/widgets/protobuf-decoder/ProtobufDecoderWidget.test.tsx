import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setCodeMirrorValue } from '@/test/codemirror'
import ProtobufDecoderWidget from './ProtobufDecoderWidget'

/** The sample payload the widget opens on: Person { id: 150, name:
 * "testing", tags: ["a", "b"], home: { city: "Paris" } }. */
const SAMPLE_PAYLOAD = 'CJYBEgd0ZXN0aW5nGgFhGgFiIgcKBVBhcmlz'

function payloadBox() {
  return screen.getByPlaceholderText(/paste a base64 or hex protobuf payload/i)
}

async function setPayload(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.clear(payloadBox())
  if (text) await user.paste(text)
}

describe('ProtobufDecoderWidget', () => {
  it('decodes the sample payload without a schema, field by field', () => {
    render(<ProtobufDecoderWidget instanceId="test" mode="grid" />)

    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('1')).toBeInTheDocument()
    expect(within(rows[0]).getByText('150')).toBeInTheDocument()
    expect(within(rows[0]).getByText('varint')).toBeInTheDocument()
    expect(screen.getByText('"testing"')).toBeInTheDocument()
    expect(screen.getByText('"Paris"')).toBeInTheDocument()
  })

  it('says what the encoding and size turned out to be', () => {
    render(<ProtobufDecoderWidget instanceId="test" mode="grid" />)
    expect(screen.getByText(/base64, 27 bytes/i)).toBeInTheDocument()
  })

  it('reads the same payload pasted as hex', async () => {
    const user = userEvent.setup()
    render(<ProtobufDecoderWidget instanceId="test" mode="grid" />)

    await setPayload(user, '08 96 01 12 07 74 65 73 74 69 6e 67')

    expect(screen.getByText(/hex, 12 bytes/i)).toBeInTheDocument()
    expect(screen.getByText('"testing"')).toBeInTheDocument()
  })

  it('strips a gRPC frame and says it did', async () => {
    const user = userEvent.setup()
    render(<ProtobufDecoderWidget instanceId="test" mode="grid" />)

    await setPayload(user, '0000000003089601')

    expect(screen.getByText(/gRPC frame detected/i)).toBeInTheDocument()
    expect(screen.getByText('150')).toBeInTheDocument()
  })

  it('offers the other readings of an ambiguous value', async () => {
    const user = userEvent.setup()
    render(<ProtobufDecoderWidget instanceId="test" mode="grid" />)

    // Field 1, varint 1: as likely a bool as a number.
    await setPayload(user, '0801')

    expect(screen.getByText(/or bool true/i)).toBeInTheDocument()
  })

  it('explains what a schema-less decode cannot know', () => {
    render(<ProtobufDecoderWidget instanceId="test" mode="grid" />)
    expect(screen.getByText(/names and declared types are not in the bytes/i)).toBeInTheDocument()
  })

  it('names the fields once the .proto is supplied', async () => {
    const user = userEvent.setup()
    render(<ProtobufDecoderWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /with \.proto/i }))

    expect(screen.getByRole('combobox', { name: /message/i })).toHaveValue('Person')
    expect(screen.getByText('name')).toBeInTheDocument()
    expect(screen.getByText('"testing"')).toBeInTheDocument()
    expect(screen.getByText('city')).toBeInTheDocument()
  })

  it('lets the message type be switched to another one in the definition', async () => {
    const user = userEvent.setup()
    render(<ProtobufDecoderWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /with \.proto/i }))
    await user.selectOptions(screen.getByRole('combobox', { name: /message/i }), 'Address')

    // Person's payload is not an Address. protobufjs decodes it to an empty
    // object without complaining, so the widget is what has to say why.
    expect(screen.getByText(/Field 1 arrived as varint but is declared string city/i)).toBeInTheDocument()
    expect(screen.getByText(/Fields 2, 3, 4 on the wire/i)).toBeInTheDocument()
  })

  it('reports a syntax error in the definition with its line', async () => {
    const user = userEvent.setup()
    render(<ProtobufDecoderWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /with \.proto/i }))
    setCodeMirrorValue(
      screen.getByRole('textbox', { name: 'Proto definition' }),
      'syntax = "proto3";\nmessage B { int32 id = ; }',
    )

    expect(screen.getByText(/line 2/i)).toBeInTheDocument()
  })

  it('warns when the payload carries fields the definition never declared', async () => {
    const user = userEvent.setup()
    render(<ProtobufDecoderWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /with \.proto/i }))
    // Field 1 (declared) plus field 9 (not in Person).
    await setPayload(user, '0896014a0568656c6c6f')

    expect(screen.getByText(/Field 9 on the wire is not in this definition/i)).toBeInTheDocument()
  })

  it('reports an unusable payload instead of decoding noise', async () => {
    const user = userEvent.setup()
    render(<ProtobufDecoderWidget instanceId="test" mode="grid" />)

    await setPayload(user, 'not a payload!!')

    expect(screen.getByText(/neither valid hex nor valid base64/i)).toBeInTheDocument()
  })

  it('keeps what it read before a truncated payload gave out', async () => {
    const user = userEvent.setup()
    render(<ProtobufDecoderWidget instanceId="test" mode="grid" />)

    await setPayload(user, '0896011209746573')

    expect(screen.getByText('150')).toBeInTheDocument()
    expect(screen.getByText(/past the end of the payload/i)).toBeInTheDocument()
    expect(screen.getByText(/everything above was read before that point/i)).toBeInTheDocument()
  })

  it('keeps payload, mode and definition across a remount of the same instance', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<ProtobufDecoderWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /with \.proto/i }))
    await setPayload(user, '089601')
    unmount()

    render(<ProtobufDecoderWidget instanceId="test" mode="grid" />)
    expect(screen.getByRole('button', { name: /with \.proto/i })).toHaveAttribute('aria-pressed', 'true')
    expect(payloadBox()).toHaveValue('089601')
    expect(screen.getByText('id')).toBeInTheDocument()
  })

  it('still decodes the sample payload after it has been re-pasted', async () => {
    const user = userEvent.setup()
    render(<ProtobufDecoderWidget instanceId="test" mode="grid" />)

    await setPayload(user, '')
    expect(screen.getByText(/paste a base64 or hex payload/i)).toBeInTheDocument()

    await user.paste(SAMPLE_PAYLOAD)
    expect(screen.getByText('"testing"')).toBeInTheDocument()
  })
})
