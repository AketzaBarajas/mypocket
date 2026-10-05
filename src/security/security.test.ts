import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";

import {
  generateOwnerSecret,
  MNEMONIC_WORDS,
  mnemonicToSecret,
  normalizeMnemonic,
  secretToMnemonic,
} from "@/data/owner";

import {
  fromBase64Url,
  hkdfKey,
  PBKDF2_ITERATIONS,
  randomBytes,
  seal,
  toBase64Url,
  toBytes,
  UnsealError,
  unseal,
  utf8,
  wipe,
} from "./crypto";
import { createKeystoreStore, newKeystore } from "./keystore";
import {
  formatWait,
  FREE_ATTEMPTS,
  isValidPin,
  isWeakPin,
  MAX_WAIT_MS,
  NO_ATTEMPTS,
  PRF_KEK_INFO,
  registerFailure,
  remainingWait,
  unwrapWithPin,
  unwrapWithPrf,
  waitAfterFailures,
  wrapWithPin,
  wrapWithPrf,
} from "./pin";

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** ¿Aparece `needle` dentro de `haystack`? */
const contains = (haystack: Uint8Array, needle: Uint8Array) => hex(haystack).includes(hex(needle));

describe("secreto del owner y frase de recuperación", () => {
  it("genera 16 bytes aleatorios", () => {
    const a = generateOwnerSecret();
    const b = generateOwnerSecret();
    expect(a).toHaveLength(16);
    expect(hex(a)).not.toBe(hex(b));
  });

  it("la frase tiene 12 palabras y recupera exactamente el mismo secreto", () => {
    const secret = generateOwnerSecret();
    const phrase = secretToMnemonic(secret);
    expect(phrase.split(" ")).toHaveLength(MNEMONIC_WORDS);
    const restored = mnemonicToSecret(phrase);
    expect(restored).not.toBeNull();
    expect(hex(restored ?? new Uint8Array())).toBe(hex(secret));
  });

  it("acepta la frase con mayúsculas y espacios de más", () => {
    const secret = generateOwnerSecret();
    const messy = `  ${secretToMnemonic(secret).toUpperCase().split(" ").join("   \n ")}  `;
    expect(normalizeMnemonic(messy)).toBe(secretToMnemonic(secret));
    expect(hex(mnemonicToSecret(messy) ?? new Uint8Array())).toBe(hex(secret));
  });

  it("rechaza frases inválidas o de otra longitud", () => {
    expect(mnemonicToSecret("")).toBeNull();
    expect(mnemonicToSecret("uno dos tres")).toBeNull();
    expect(mnemonicToSecret(Array.from({ length: 12 }, () => "abandon").join(" "))).toBeNull();
    const words = secretToMnemonic(generateOwnerSecret()).split(" ");
    expect(mnemonicToSecret(words.slice(0, 11).join(" "))).toBeNull();
    expect(mnemonicToSecret([...words.slice(0, 11), "zzzz"].join(" "))).toBeNull();
  });
});

describe("primitivas", () => {
  it("convierte a base64url y vuelve", () => {
    const bytes = randomBytes(37);
    const text = toBase64Url(bytes);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(hex(fromBase64Url(text))).toBe(hex(bytes));
    expect(toBase64Url(new Uint8Array([251, 255, 254]))).toBe("-__-");
  });

  it("copia los bytes en lugar de compartir el búfer", () => {
    const source = new Uint8Array([1, 2, 3, 4]);
    const copy = toBytes(source.subarray(1, 3));
    expect([...copy]).toEqual([2, 3]);
    source.fill(9);
    expect([...copy]).toEqual([2, 3]);
    expect([...toBytes(new Uint8Array([7, 8]).buffer)]).toEqual([7, 8]);
  });

  it("sobrescribe un secreto en memoria", () => {
    const secret = new Uint8Array([1, 2, 3]);
    wipe(secret);
    expect([...secret]).toEqual([0, 0, 0]);
    expect(() => wipe(null)).not.toThrow();
  });

  it("cifra con AES-GCM y un IV distinto cada vez", async () => {
    const key = await hkdfKey(randomBytes(32), "test/v1");
    const plaintext = utf8("dato financiero");
    const a = await seal(key, plaintext);
    const b = await seal(key, plaintext);
    expect(a.iv).toHaveLength(12);
    expect(hex(a.iv)).not.toBe(hex(b.iv));
    expect(hex(a.ciphertext)).not.toBe(hex(b.ciphertext));
    expect(contains(a.ciphertext, plaintext)).toBe(false);
    expect(new TextDecoder().decode(await unseal(key, a))).toBe("dato financiero");
  });

  it("falla al descifrar con otra clave o con datos alterados", async () => {
    const material = randomBytes(32);
    const key = await hkdfKey(material, "test/v1");
    const sealed = await seal(key, utf8("hola"));

    await expect(unseal(await hkdfKey(randomBytes(32), "test/v1"), sealed)).rejects.toThrow(
      UnsealError,
    );
    // El mismo material con otro `info` da una clave independiente.
    await expect(unseal(await hkdfKey(material, "test/v2"), sealed)).rejects.toThrow(UnsealError);

    const tampered = { iv: sealed.iv, ciphertext: new Uint8Array(sealed.ciphertext) };
    tampered.ciphertext[0] = (tampered.ciphertext[0] ?? 0) ^ 1;
    await expect(unseal(key, tampered)).rejects.toThrow(UnsealError);
  });

  it("las claves derivadas no son extraíbles", async () => {
    const key = await hkdfKey(randomBytes(32), "test/v1");
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });
});

describe("envoltura por PIN", () => {
  it("usa PBKDF2 con al menos 600 000 iteraciones y sal aleatoria", async () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    const secret = generateOwnerSecret();
    const a = await wrapWithPin(secret, "482913");
    const b = await wrapWithPin(secret, "482913");
    expect(a.iterations).toBe(PBKDF2_ITERATIONS);
    expect(a.salt).toHaveLength(16);
    expect(hex(a.salt)).not.toBe(hex(b.salt));
    expect(hex(a.ciphertext)).not.toBe(hex(b.ciphertext));
  });

  it("desenvuelve con el PIN correcto y falla con cualquier otro", async () => {
    const secret = generateOwnerSecret();
    const envelope = await wrapWithPin(secret, "482913");
    expect(hex(await unwrapWithPin(envelope, "482913"))).toBe(hex(secret));
    await expect(unwrapWithPin(envelope, "482914")).rejects.toThrow(UnsealError);
    await expect(unwrapWithPin(envelope, "")).rejects.toThrow(UnsealError);
  });

  it("el secreto no aparece en claro en la envoltura", async () => {
    const secret = generateOwnerSecret();
    const envelope = await wrapWithPin(secret, "482913");
    expect(contains(envelope.ciphertext, secret)).toBe(false);
    expect(contains(envelope.salt, secret)).toBe(false);
  });

  it("valida el formato del PIN", () => {
    expect(isValidPin("482913")).toBe(true);
    expect(isValidPin("48291")).toBe(false);
    expect(isValidPin("4829134")).toBe(false);
    expect(isValidPin("48291a")).toBe(false);
    expect(isWeakPin("111111")).toBe(true);
    expect(isWeakPin("123456")).toBe(true);
    expect(isWeakPin("654321")).toBe(true);
    expect(isWeakPin("482913")).toBe(false);
  });
});

describe("envoltura por passkey (PRF)", () => {
  // El PRF real lo calcula el autenticador; aquí se simula su salida de 32 bytes.
  it("la salida del PRF pasa por HKDF y desenvuelve el secreto", async () => {
    const secret = generateOwnerSecret();
    const prfOutput = randomBytes(32);
    const sealed = await wrapWithPrf(secret, prfOutput);
    expect(hex(await unwrapWithPrf(sealed, prfOutput))).toBe(hex(secret));
    expect(contains(sealed.ciphertext, secret)).toBe(false);
  });

  it("es determinista respecto a la salida del PRF: la misma salida abre siempre", async () => {
    const secret = generateOwnerSecret();
    const prfOutput = randomBytes(32);
    const sealed = await wrapWithPrf(secret, prfOutput);
    expect(hex(await unwrapWithPrf(sealed, new Uint8Array(prfOutput)))).toBe(hex(secret));
  });

  it("otra passkey (otra salida de PRF) no puede desenvolver", async () => {
    const sealed = await wrapWithPrf(generateOwnerSecret(), randomBytes(32));
    await expect(unwrapWithPrf(sealed, randomBytes(32))).rejects.toThrow(UnsealError);
  });

  it("usa la etiqueta de dominio acordada", async () => {
    expect(PRF_KEK_INFO).toBe("mypocket/kek/prf/v1");
    const secret = generateOwnerSecret();
    const prfOutput = randomBytes(32);
    const sealed = await wrapWithPrf(secret, prfOutput);
    const sameKey = await hkdfKey(prfOutput, "mypocket/kek/prf/v1");
    expect(hex(await unseal(sameKey, sealed))).toBe(hex(secret));
  });

  it("las dos envolturas son independientes", async () => {
    const secret = generateOwnerSecret();
    const prfOutput = randomBytes(32);
    const byPasskey = await wrapWithPrf(secret, prfOutput);
    const byPin = await wrapWithPin(secret, "482913");
    expect(hex(byPasskey.ciphertext)).not.toBe(hex(byPin.ciphertext));
    expect(hex(await unwrapWithPrf(byPasskey, prfOutput))).toBe(
      hex(await unwrapWithPin(byPin, "482913")),
    );
  });
});

describe("espera exponencial del PIN", () => {
  it("los cuatro primeros fallos no tienen espera", () => {
    for (let failed = 0; failed < FREE_ATTEMPTS; failed += 1)
      expect(waitAfterFailures(failed)).toBe(0);
  });

  it("tras 5 fallos espera 30 s y se duplica en cada fallo siguiente", () => {
    expect([5, 6, 7, 8, 9].map(waitAfterFailures)).toEqual([
      30_000, 60_000, 120_000, 240_000, 480_000,
    ]);
  });

  it("tiene un tope de 24 horas", () => {
    expect(waitAfterFailures(50)).toBe(MAX_WAIT_MS);
    expect(waitAfterFailures(10_000)).toBe(MAX_WAIT_MS);
  });

  it("calcula el tiempo que falta", () => {
    const now = 1_000_000;
    let attempts = NO_ATTEMPTS;
    expect(remainingWait(attempts, now)).toBe(0);
    for (let i = 0; i < 4; i += 1) attempts = registerFailure(attempts, now);
    expect(remainingWait(attempts, now)).toBe(0);

    attempts = registerFailure(attempts, now);
    expect(attempts).toEqual({ failed: 5, lastFailedAt: now });
    expect(remainingWait(attempts, now)).toBe(30_000);
    expect(remainingWait(attempts, now + 10_000)).toBe(20_000);
    expect(remainingWait(attempts, now + 30_000)).toBe(0);
    expect(remainingWait(attempts, now + 999_999)).toBe(0);

    attempts = registerFailure(attempts, now + 30_000);
    expect(remainingWait(attempts, now + 30_000)).toBe(60_000);
  });

  it("atrasar el reloj no acorta la espera", () => {
    const attempts = { failed: 5, lastFailedAt: 1_000_000 };
    expect(remainingWait(attempts, 500_000)).toBe(30_000);
  });

  it("formatea la espera", () => {
    expect(formatWait(30_000)).toBe("30 s");
    expect(formatWait(500)).toBe("1 s");
    expect(formatWait(60_000)).toBe("1 min");
    expect(formatWait(90_000)).toBe("2 min");
    expect(formatWait(3_600_000)).toBe("1 h");
    expect(formatWait(3_900_000)).toBe("1 h 5 min");
  });
});

describe("keystore", () => {
  const make = async (name: string) => {
    const secret = generateOwnerSecret();
    const prfOutput = randomBytes(32);
    const store = createKeystoreStore(name);
    const stored = newKeystore({
      pin: await wrapWithPin(secret, "482913"),
      passkey: { credentialId: randomBytes(20), ...(await wrapWithPrf(secret, prfOutput)) },
      relayUrl: "wss://free.evoluhq.com",
      onboarding: "pending",
      createdAt: "2026-10-05T10:00:00.000Z",
    });
    return { secret, prfOutput, store, stored };
  };

  it("está vacío hasta que se configura el dispositivo", async () => {
    expect(await createKeystoreStore("ks-empty").read()).toBeNull();
    expect(await createKeystoreStore("ks-empty").update((current) => current)).toBeNull();
  });

  it("guarda las dos envolturas y permite recuperar el secreto por ambas vías", async () => {
    const { secret, prfOutput, store, stored } = await make("ks-roundtrip");
    await store.write(stored);
    const loaded = await store.read();
    expect(loaded).not.toBeNull();
    if (!loaded?.passkey) throw new Error("Falta la envoltura de passkey");
    expect(hex(await unwrapWithPin(loaded.pin, "482913"))).toBe(hex(secret));
    expect(hex(await unwrapWithPrf(loaded.passkey, prfOutput))).toBe(hex(secret));
    expect(loaded.attempts).toEqual(NO_ATTEMPTS);
    expect(loaded.backup).toEqual({ lastBackupAt: null, fileId: null });
  });

  it("nunca contiene el secreto ni la frase en claro", async () => {
    const { secret, store, stored } = await make("ks-plaintext");
    await store.write(stored);
    const loaded = await store.read();
    const phrase = secretToMnemonic(secret);
    const secretHex = hex(secret);

    const visit = (value: unknown): void => {
      if (value instanceof Uint8Array) {
        expect(hex(value)).not.toContain(secretHex);
      } else if (typeof value === "string") {
        expect(value).not.toContain(phrase);
        expect(value).not.toContain(secretHex);
        expect(value).not.toContain(toBase64Url(secret));
      } else if (typeof value === "object" && value !== null) {
        Object.values(value).forEach(visit);
      }
    };
    visit(loaded);
  });

  it("persiste los intentos fallidos y no borra nada por fallar", async () => {
    const { secret, store, stored } = await make("ks-attempts");
    await store.write(stored);
    let attempts = NO_ATTEMPTS;
    for (let i = 0; i < 12; i += 1) {
      attempts = registerFailure(attempts, 1_000 + i);
      await store.setAttempts(attempts);
    }
    const loaded = await store.read();
    expect(loaded?.attempts).toEqual({ failed: 12, lastFailedAt: 1_011 });
    // Tras 12 fallos, el secreto sigue ahí y el PIN correcto lo abre.
    if (!loaded) throw new Error("El keystore debería seguir existiendo");
    expect(hex(await unwrapWithPin(loaded.pin, "482913"))).toBe(hex(secret));
  });

  it("actualiza campos sueltos", async () => {
    const { store, stored } = await make("ks-update");
    await store.write(stored);
    await store.update((current) => ({ ...current, onboarding: "done", passkey: null }));
    const loaded = await store.read();
    expect(loaded?.onboarding).toBe("done");
    expect(loaded?.passkey).toBeNull();
  });

  it("trata un almacén corrupto como no configurado", async () => {
    const request = indexedDB.open("ks-corrupt", 1);
    await new Promise<void>((resolve) => {
      request.onupgradeneeded = () => request.result.createObjectStore("keystore");
      request.onsuccess = () => {
        const tx = request.result.transaction("keystore", "readwrite");
        tx.objectStore("keystore").put({ version: 99, basura: true }, "main");
        tx.oncomplete = () => {
          request.result.close();
          resolve();
        };
      };
    });
    expect(await createKeystoreStore("ks-corrupt").read()).toBeNull();
  });

  it("al destruirlo no queda nada", async () => {
    const { store, stored } = await make("ks-destroy");
    await store.write(stored);
    await store.destroy();
    expect(await store.read()).toBeNull();
  });
});
