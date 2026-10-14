// A shared room: one Yjs document (the graph) and its awareness (who is here, where their pointer is, what
// they have selected), kept in step between every tab of this browser that opens the same room.
//
// The transport is a BroadcastChannel, so the example runs with no server — open it in two tabs. For people
// on different machines, swap this file's channel for a provider and keep everything else:
//
//   import { WebsocketProvider } from 'y-websocket';
//   const provider = new WebsocketProvider('wss://your-server', room, doc);
//   const awareness = provider.awareness;
//
// (or `y-webrtc`'s WebrtcProvider). The document and awareness are the same objects either way.
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';

type Message =
  | { type: 'hello' }
  | { type: 'update'; update: Uint8Array }
  | { type: 'awareness'; update: Uint8Array };

export interface Room {
  doc: Y.Doc;
  awareness: Awareness;
  /** Resolves once the tabs already in the room have had a moment to send what they have. */
  ready: Promise<void>;
  leave: () => void;
}

export function joinRoom(name: string): Room {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const channel = new BroadcastChannel(`flowinger-presence-${name}`);
  const send = (message: Message) => channel.postMessage(message);

  // What changes here goes to the others; what arrives from them is applied with the channel as its origin,
  // so it is not sent back.
  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== channel) send({ type: 'update', update });
  };
  const onAwareness = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === channel) return;
    send({ type: 'awareness', update: encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]) });
  };
  doc.on('update', onUpdate);
  awareness.on('update', onAwareness);

  channel.onmessage = (event: MessageEvent<Message>) => {
    const message = event.data;
    if (message.type === 'update') Y.applyUpdate(doc, message.update, channel);
    else if (message.type === 'awareness') applyAwarenessUpdate(awareness, message.update, channel);
    else {
      // Someone joined: send them the whole document, and who is here.
      send({ type: 'update', update: Y.encodeStateAsUpdate(doc) });
      send({ type: 'awareness', update: encodeAwarenessUpdate(awareness, [...awareness.getStates().keys()]) });
    }
  };
  send({ type: 'hello' });

  // Closing the tab says goodbye, so the others drop this cursor at once rather than after a timeout.
  const goodbye = () => removeAwarenessStates(awareness, [doc.clientID], 'leave');
  window.addEventListener('pagehide', goodbye);

  return {
    doc,
    awareness,
    ready: new Promise((resolve) => setTimeout(resolve, 250)),
    leave: () => {
      goodbye();
      window.removeEventListener('pagehide', goodbye);
      doc.off('update', onUpdate);
      awareness.off('update', onAwareness);
      channel.close();
      awareness.destroy();
      doc.destroy();
    },
  };
}
