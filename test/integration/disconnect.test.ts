import { afterAll, beforeAll, expect, test } from 'vitest';

import { sessionBus } from '@/index';
import { Message } from '@/message-type';
import { Interface, method, signal } from '@/service/interface';

import { call, ping } from '../util';

const TEST_NAME = 'org.test.disconnect';
const TEST_PATH = '/org/test/path';
const TEST_IFACE = 'org.test.iface';

const bus = sessionBus();
bus.on('error', (err: Error) => {
  console.log(`got unexpected connection error:\n${err.stack ?? ''}`);
});

class TestInterface extends Interface {
  @method({ inSignature: 's', outSignature: 's' })
  Echo(what: string): string {
    return what;
  }

  @signal({})
  SomeSignal(): void {}
}

const testIface = new TestInterface(TEST_IFACE);

beforeAll(async () => {
  await bus.requestName(TEST_NAME);
  bus.export(TEST_PATH, testIface);
});

afterAll(() => {
  bus.disconnect();
});

test('what happens when a bus disconnects', async () => {
  // low level: sending a message on a disconnected bus should throw
  let bus2 = sessionBus();
  await ping(bus2);
  bus2.disconnect();
  await expect(ping(bus2)).rejects.toThrow();

  // high level: calling a method on an object with a disconnected bus should
  // throw
  bus2 = sessionBus();
  await ping(bus2);
  let obj = await bus2.getProxyObject(TEST_NAME, TEST_PATH);
  let iface = obj.getInterface(TEST_IFACE);
  bus2.disconnect();
  await expect(call(iface, 'Echo', 'hi')).rejects.toThrow();

  // high level: if you're listening to a signal and the bus disonnects, there
  // shouldn't be a warning
  bus2 = sessionBus();
  await ping(bus2);
  obj = await bus2.getProxyObject(TEST_NAME, TEST_PATH);
  iface = obj.getInterface(TEST_IFACE);
  const fn = (): void => {};
  iface.on('SomeSignal', fn);
  await ping(bus2);
  bus2.disconnect();
  iface.removeListener('SomeSignal', fn);
});

test('a method call read after disconnect() is dropped, not answered on the closed stream', async () => {
  const service = sessionBus();
  await ping(service);
  service.export(TEST_PATH, new TestInterface(TEST_IFACE));
  service.disconnect();
  // As if the socket still had it buffered: the reply cannot go out any more, and must not throw.
  const late = new Message({
    destination: service.name ?? undefined,
    path: TEST_PATH,
    interface: TEST_IFACE,
    member: 'Echo',
    signature: 's',
    body: ['late'],
    serial: 1,
  });
  expect(() => service._connection.emit('message', late)).not.toThrow();
});

test('a client calling while the service disconnects leaves no uncaught error', async () => {
  for (let i = 0; i < 20; i++) {
    const service = sessionBus();
    await service.requestName(`${TEST_NAME}.race${i}`);
    service.export(TEST_PATH, new TestInterface(TEST_IFACE));
    const client = sessionBus();
    const obj = await client.getProxyObject(`${TEST_NAME}.race${i}`, TEST_PATH);
    const pending = call(obj.getInterface(TEST_IFACE), 'Echo', 'hi').catch(() => null);
    service.disconnect();
    await pending;
    client.disconnect();
  }
  // vitest fails the run on an uncaught exception, which is what this would have thrown
  await new Promise((r) => setTimeout(r, 200));
});
