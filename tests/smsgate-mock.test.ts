import { it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { enviarPorCelular, numerosPermitidos } from "../supabase/functions/enviar-mensajes/smsgate";

/**
 * El envío de SMS contra un servidor SIMULADO de la API de SMS Gateway for
 * Android (POST /message, Basic auth, {textMessage:{text}, phoneNumbers:[…]}).
 * Nada sale a internet ni a ningún celular: el servidor vive en 127.0.0.1 y
 * dura lo que dura el test. Corre siempre, no necesita base.
 */

type Recibido = { auth: string | undefined; cuerpo: { textMessage?: { text?: string }; phoneNumbers?: string[] } };

let servidor: Server;
let url: string;
let recibidos: Recibido[] = [];
let respuesta: { status: number; json: unknown } = { status: 202, json: { id: "msg-1", state: "Pending" } };

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let texto = "";
    req.on("data", (c) => (texto += c));
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/3rdparty/v1/message") {
        recibidos.push({ auth: req.headers.authorization, cuerpo: JSON.parse(texto || "{}") });
        res.writeHead(respuesta.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(respuesta.json));
      } else {
        res.writeHead(404).end();
      }
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/3rdparty/v1`;
});

afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

beforeEach(() => {
  recibidos = [];
  respuesta = { status: 202, json: { id: "msg-1", state: "Pending" } };
});

const cfg = () => ({ url, usuario: "u", clave: "p" });

it("manda el texto al número con las credenciales Basic y devuelve el id de la app", async () => {
  const id = await enviarPorCelular(cfg(), "+573001112222", "A Tiempo: recibimos tu pago de $20.000 del pedido ATL-1. Ref abcd1234");
  expect(id).toBe("msg-1");
  expect(recibidos).toHaveLength(1);
  expect(recibidos[0].auth).toBe(`Basic ${btoa("u:p")}`);
  expect(recibidos[0].cuerpo.phoneNumbers).toEqual(["+573001112222"]);
  expect(recibidos[0].cuerpo.textMessage?.text).toContain("Ref abcd1234");
});

it("un error de la app sube como excepción con su motivo (el buzón reintenta)", async () => {
  respuesta = { status: 401, json: { message: "Credenciales inválidas" } };
  await expect(enviarPorCelular(cfg(), "+573001112222", "hola")).rejects.toThrow(/Credenciales inválidas/);
});

it("con SMSGATE_SOLO_A, un número ajeno ni siquiera llega al servidor", async () => {
  const c = { ...cfg(), soloA: "+573245769748" };
  await expect(enviarPorCelular(c, "+573001112222", "hola")).rejects.toThrow(/SMSGATE_SOLO_A/);
  expect(recibidos).toHaveLength(0);
  await enviarPorCelular(c, "+573245769748", "hola Henry");
  expect(recibidos).toHaveLength(1);
});

it("la lista permitida ignora espacios y vacíos", () => {
  expect(numerosPermitidos(" +57 324 576 9748 , ")).toEqual(["+573245769748"]);
  expect(numerosPermitidos("")).toBeNull();
  expect(numerosPermitidos(undefined)).toBeNull();
});
