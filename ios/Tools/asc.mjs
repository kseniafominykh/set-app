#!/usr/bin/env node
// App Store Connect для «SET» по официальному API - без веб-интерфейса.
//
//   node Tools/asc.mjs status       приложение, bundle id, свежие сборки, группы - одной сводкой
//   node Tools/asc.mjs bundle       завести bundle id в Apple Developer (Identifiers), если его нет
//   node Tools/asc.mjs builds       последние сборки и их состояние
//   node Tools/asc.mjs internal     внутренняя группа «Свои» со всеми сборками + все пользователи команды в ней
//   node Tools/asc.mjs external     внешняя группа «Все»: тексты из testflight-content.json, свежая сборка, ссылка
//   node Tools/asc.mjs submit       отправить свежую сборку на бета-проверку Apple (нужна для внешней группы)
//   node Tools/asc.mjs link         публичная ссылка внешней группы и состояние проверки
//   node Tools/asc.mjs invite <почта> <имя> <фамилия>
//                                   пригласить в команду (роль «Маркетинг», только SET) - для теста без проверки Apple
//   node Tools/asc.mjs uninvite <почта>
//                                   отозвать неотвеченное приглашение
//
// Внутреннее тестирование - без бета-проверки Apple, сборка появляется в TestFlight через 5-15 минут.
// Внешнее (по публичной ссылке, до 10 000 человек) - после бета-проверки Apple, обычно до суток.
//
// Доступ - ключ App Store Connect API, как в «Окошке»:
//   ~/.appstoreconnect/admin_key/AuthKey_<ID>.p8 (или private_keys/), ~/.appstoreconnect/issuer_id
// Ключ никогда не печатается: из него локально подписывается токен на 15 минут.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BUNDLE_ID = 'com.naumkogan.set';
const BUNDLE_NAME = 'SET';
const GROUP = 'Свои';
const API = 'https://api.appstoreconnect.apple.com/v1';
const ASC_DIR = path.join(os.homedir(), '.appstoreconnect');
const KEY_DIRS = [path.join(ASC_DIR, 'admin_key'), path.join(ASC_DIR, 'private_keys')];

const APP_MISSING =
  `приложения с bundle id ${BUNDLE_ID} ещё нет в App Store Connect.\n` +
  '  appstoreconnect.apple.com → Приложения → «+» → Новое приложение:\n' +
  '  платформа iOS, имя «SET - всё для съёмки», основной язык «Русский»,\n' +
  `  bundle id ${BUNDLE_ID}, SKU set-app, доступ - полный.\n` +
  '  Через API приложение создать нельзя - только в веб-интерфейсе.';

function die(message) {
  console.error(`\nОстановлено: ${message}\n`);
  process.exit(1);
}

const read = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

function credentials() {
  let keyPath = process.env.ASC_KEY_PATH;
  for (const dir of KEY_DIRS) {
    if (keyPath) break;
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => /^AuthKey_[A-Za-z0-9]+\.p8$/.test(f));
    } catch {}
    if (files.length > 1) die(`в ${dir} несколько ключей, оставьте один: ${files.join(', ')}`);
    if (files.length === 1) keyPath = path.join(dir, files[0]);
  }
  if (!keyPath) die(`нет ключа App Store Connect API в ${KEY_DIRS[0]}`);
  const privateKey = read(keyPath);
  if (!privateKey) die(`не читается файл ключа ${keyPath}`);
  const keyId = (process.env.ASC_KEY_ID || path.basename(keyPath).replace(/^AuthKey_|\.p8$/g, '')).trim();
  const issuer = (process.env.ASC_ISSUER_ID || read(path.join(ASC_DIR, 'issuer_id')) || '').trim();
  if (!issuer) die(`нет Issuer ID в ${path.join(ASC_DIR, 'issuer_id')}`);
  return { keyId, issuer, privateKey };
}

const b64 = (value) => Buffer.from(value).toString('base64url');

function token({ keyId, issuer, privateKey }) {
  const header = b64(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64(JSON.stringify({ iss: issuer, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }));
  const signature = crypto
    .sign('sha256', Buffer.from(`${header}.${payload}`), { key: crypto.createPrivateKey(privateKey), dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  return `${header}.${payload}.${signature}`;
}

async function call(jwt, method, endpoint, body, { soft = false } = {}) {
  let response;
  try {
    response = await fetch(`${API}${endpoint}`, {
      method,
      headers: { authorization: `Bearer ${jwt}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    die(`нет связи с App Store Connect: ${error.cause?.code ?? error.message}`);
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = (data?.errors ?? []).map((e) => `${e.title}: ${e.detail}`).join('; ') || `HTTP ${response.status}`;
    if (response.status === 401) die('App Store Connect не принял ключ (401): проверьте Issuer ID и что ключ не отозван.');
    if (soft) return { failed: true, status: response.status, detail };
    die(`App Store Connect ответил ${response.status}. ${detail}`);
  }
  return data;
}

async function findApp(jwt) {
  const data = await call(jwt, 'GET', `/apps?filter[bundleId]=${BUNDLE_ID}&limit=5&fields[apps]=name,bundleId,sku`);
  return data.data?.find((a) => a.attributes.bundleId === BUNDLE_ID) ?? null;
}

async function findBundle(jwt) {
  const data = await call(jwt, 'GET', `/bundleIds?filter[identifier]=${BUNDLE_ID}&limit=20`);
  return data.data?.find((b) => b.attributes.identifier === BUNDLE_ID) ?? null;
}

const PROCESSING = { PROCESSING: 'обрабатывается', FAILED: 'ошибка обработки', INVALID: 'отклонена', VALID: 'готова' };

async function recentBuilds(jwt, appId, limit = 5) {
  const data = await call(
    jwt,
    'GET',
    `/builds?filter[app]=${appId}&limit=${limit}&sort=-uploadedDate` +
      '&fields[builds]=version,processingState,uploadedDate,expired,preReleaseVersion' +
      '&include=preReleaseVersion&fields[preReleaseVersions]=version',
  );
  const pre = new Map((data.included ?? []).map((x) => [x.id, x.attributes.version]));
  return data.data.map((b) => ({ id: b.id, ...b.attributes, marketing: pre.get(b.relationships?.preReleaseVersion?.data?.id) }));
}

const label = (b) => `${b.marketing ?? '?'} (${b.version}) - ${b.expired ? 'истекла' : PROCESSING[b.processingState] ?? b.processingState}`;

async function groups(jwt, appId) {
  const data = await call(jwt, 'GET', `/betaGroups?filter[app]=${appId}&limit=50&fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds`);
  return data.data;
}

async function commandStatus(jwt) {
  const bundle = await findBundle(jwt);
  console.log(`bundle id ${BUNDLE_ID}: ${bundle ? 'заведён' : 'НЕТ (node Tools/asc.mjs bundle)'}`);
  const app = await findApp(jwt);
  if (!app) die(APP_MISSING);
  console.log(`приложение: «${app.attributes.name}» (SKU ${app.attributes.sku}, id ${app.id})`);
  const builds = await recentBuilds(jwt, app.id);
  console.log(builds.length ? `сборки:\n${builds.map((b) => `  ${label(b)}`).join('\n')}` : 'сборок пока нет');
  const list = await groups(jwt, app.id);
  console.log(list.length ? `группы: ${list.map((g) => `«${g.attributes.name}»${g.attributes.isInternalGroup ? ' (внутренняя)' : ''}`).join(', ')}` : 'групп пока нет');
}

async function commandBundle(jwt) {
  const existing = await findBundle(jwt);
  if (existing) return console.log(`bundle id ${BUNDLE_ID} уже заведён (${existing.attributes.name})`);
  await call(jwt, 'POST', '/bundleIds', {
    data: { type: 'bundleIds', attributes: { identifier: BUNDLE_ID, name: BUNDLE_NAME, platform: 'IOS' } },
  });
  console.log(`bundle id ${BUNDLE_ID} заведён - теперь его можно выбрать при создании приложения`);
}

async function commandBuilds(jwt) {
  const app = await findApp(jwt);
  if (!app) die(APP_MISSING);
  const builds = await recentBuilds(jwt, app.id, 10);
  console.log(builds.length ? builds.map(label).join('\n') : 'сборок пока нет');
}

async function commandInternal(jwt) {
  const app = await findApp(jwt);
  if (!app) die(APP_MISSING);
  let group = (await groups(jwt, app.id)).find((g) => g.attributes.isInternalGroup && g.attributes.name === GROUP);
  if (!group) {
    const created = await call(jwt, 'POST', '/betaGroups', {
      data: {
        type: 'betaGroups',
        attributes: { name: GROUP, isInternalGroup: true, hasAccessToAllBuilds: true },
        relationships: { app: { data: { type: 'apps', id: app.id } } },
      },
    });
    group = created.data;
    console.log(`внутренняя группа «${GROUP}» создана: в ней будут все сборки`);
  } else {
    console.log(`внутренняя группа «${GROUP}» уже есть`);
  }

  // Внутренние тестировщики - только пользователи команды App Store Connect.
  const users = (await call(jwt, 'GET', '/users?limit=50&fields[users]=username,firstName,lastName,roles')).data;
  const inGroup = await call(jwt, 'GET', `/betaGroups/${group.id}/betaTesters?limit=200&fields[betaTesters]=email`);
  const already = new Set((inGroup.data ?? []).map((t) => t.attributes.email?.toLowerCase()));
  for (const u of users) {
    const email = u.attributes.username;
    if (!email || already.has(email.toLowerCase())) {
      console.log(`  ${email}: уже в группе`);
      continue;
    }
    const res = await call(jwt, 'POST', '/betaTesters', {
      data: {
        type: 'betaTesters',
        attributes: { email, firstName: u.attributes.firstName, lastName: u.attributes.lastName },
        relationships: { betaGroups: { data: [{ type: 'betaGroups', id: group.id }] } },
      },
    }, { soft: true });
    console.log(`  ${email}: ${res?.failed ? `не добавлен - ${res.detail}` : 'добавлен, придёт письмо-приглашение TestFlight'}`);
  }
}

// ------------------------------------------------------------------ внешний тест: публичная ссылка

const CONTENT_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), 'testflight-content.json');

/** Создать или обновить запись по ключу (locale и т. п.); ключ при обновлении не трогаем. */
async function upsert(jwt, { what, list, match, type, attributes, keyFields, relationships }) {
  const existing = await call(jwt, 'GET', `${list}?limit=50`);
  const found = existing.data?.find(match);
  if (found) {
    const body = { ...attributes };
    for (const k of keyFields) delete body[k];
    await call(jwt, 'PATCH', `/${type}/${found.id}`, { data: { type, id: found.id, attributes: body } });
    console.log(`  ${what} - обновлено`);
    return found;
  }
  const created = await call(jwt, 'POST', `/${type}`, { data: { type, attributes, relationships } });
  console.log(`  ${what} - записано`);
  return created.data;
}

async function latestReadyBuild(jwt, appId) {
  const [build] = await recentBuilds(jwt, appId, 1);
  if (!build) die('сборок нет - загрузите: bash Tools/testflight.sh --upload');
  if (build.processingState !== 'VALID') die(`сборка ${label(build)}. Обработка занимает 5-15 минут.`);
  return build;
}

async function externalGroup(jwt, appId, name) {
  const list = await groups(jwt, appId);
  const found = list.find((g) => g.attributes.name === name);
  if (found?.attributes.isInternalGroup) die(`группа «${name}» уже есть, но она внутренняя`);
  if (found) return found;
  const created = await call(jwt, 'POST', '/betaGroups', {
    data: {
      type: 'betaGroups',
      attributes: { name, feedbackEnabled: true },
      relationships: { app: { data: { type: 'apps', id: appId } } },
    },
  });
  console.log(`  группа «${name}» - создана`);
  return created.data;
}

async function enablePublicLink(jwt, group) {
  const res = await call(jwt, 'PATCH', `/betaGroups/${group.id}`, {
    data: { type: 'betaGroups', id: group.id, attributes: { publicLinkEnabled: true, publicLinkLimitEnabled: false } },
  }, { soft: true });
  if (res?.failed) {
    console.log(`  публичная ссылка пока не включилась (${res.detail}) - Apple включает её после бета-проверки`);
    return null;
  }
  return res.data.attributes.publicLink ?? null;
}

async function commandExternal(jwt) {
  const content = JSON.parse(read(CONTENT_FILE) ?? die(`нет ${CONTENT_FILE}`));
  const app = await findApp(jwt);
  if (!app) die(APP_MISSING);
  const locale = content.locale ?? 'ru';
  console.log(`\n«${app.attributes.name}»: внешний тест\n`);

  await upsert(jwt, {
    what: 'описание для тестировщиков',
    list: `/apps/${app.id}/betaAppLocalizations`,
    match: (r) => r.attributes.locale === locale,
    type: 'betaAppLocalizations',
    attributes: {
      locale,
      description: content.betaAppDescription,
      feedbackEmail: content.feedbackEmail,
      privacyPolicyUrl: content.privacyPolicyUrl,
      marketingUrl: content.marketingUrl,
    },
    keyFields: ['locale'],
    relationships: { app: { data: { type: 'apps', id: app.id } } },
  });

  // Запись для проверяющего Apple заводится вместе с приложением - её только обновляем.
  const detail = await call(jwt, 'GET', `/apps/${app.id}/betaAppReviewDetail`);
  const c = content.contact;
  await call(jwt, 'PATCH', `/betaAppReviewDetails/${detail.data.id}`, {
    data: {
      type: 'betaAppReviewDetails',
      id: detail.data.id,
      attributes: {
        contactFirstName: c.firstName, contactLastName: c.lastName, contactEmail: c.email, contactPhone: c.phone,
        demoAccountRequired: false, notes: content.reviewNotes,
      },
    },
  });
  console.log('  контакты и заметки для проверяющего Apple - записаны');

  const build = await latestReadyBuild(jwt, app.id);
  await upsert(jwt, {
    what: `что тестировать (сборка ${build.marketing} (${build.version}))`,
    list: `/builds/${build.id}/betaBuildLocalizations`,
    match: (r) => r.attributes.locale === locale,
    type: 'betaBuildLocalizations',
    attributes: { locale, whatsNew: content.whatToTest },
    keyFields: ['locale'],
    relationships: { build: { data: { type: 'builds', id: build.id } } },
  });

  const group = await externalGroup(jwt, app.id, content.groupName ?? 'Все');
  const attach = await call(jwt, 'POST', `/betaGroups/${group.id}/relationships/builds`, { data: [{ type: 'builds', id: build.id }] }, { soft: true });
  if (attach?.failed && !/already/i.test(attach.detail)) die(`сборка не добавилась в группу: ${attach.detail}`);
  console.log(`  сборка ${build.marketing} (${build.version}) - в группе «${group.attributes.name}»`);

  const link = await enablePublicLink(jwt, group);
  if (link) console.log(`\n  Публичная ссылка: ${link}`);
  console.log('\n  Дальше: node Tools/asc.mjs submit - отправить сборку на бета-проверку Apple\n');
}

async function commandSubmit(jwt) {
  const app = await findApp(jwt);
  if (!app) die(APP_MISSING);
  const build = await latestReadyBuild(jwt, app.id);
  const res = await call(jwt, 'POST', '/betaAppReviewSubmissions', {
    data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: build.id } } } },
  }, { soft: true });
  if (res?.failed) {
    if (/already/i.test(res.detail)) return console.log(`сборка ${label(build)} уже на проверке`);
    die(`на проверку не ушло: ${res.detail}`);
  }
  console.log(`сборка ${label(build)} отправлена на бета-проверку Apple (обычно до суток)`);
}

async function commandLink(jwt) {
  const app = await findApp(jwt);
  if (!app) die(APP_MISSING);
  const content = JSON.parse(read(CONTENT_FILE) ?? '{}');
  const name = content.groupName ?? 'Все';
  const group = (await groups(jwt, app.id)).find((g) => g.attributes.name === name);
  if (!group) die(`группы «${name}» нет - node Tools/asc.mjs external`);
  const full = await call(jwt, 'GET', `/betaGroups/${group.id}?fields[betaGroups]=publicLink,publicLinkEnabled`);
  const link = full.data.attributes.publicLink ?? (await enablePublicLink(jwt, group));
  console.log(link ?? 'ссылки пока нет: Apple включит её после бета-проверки');

  const builds = await call(jwt, 'GET', `/builds?filter[app]=${app.id}&limit=1&sort=-uploadedDate&include=buildBetaDetail&fields[buildBetaDetails]=externalBuildState`);
  const state = builds.included?.[0]?.attributes?.externalBuildState;
  if (state) console.log(`состояние внешнего теста свежей сборки: ${state}`);
}

// ------------------------------------------------------------------ приглашение в команду: TestFlight без бета-проверки

/**
 * Пригласить человека в команду App Store Connect с ролью «Маркетинг» и доступом только к SET.
 * Когда он примет приглашение, `internal` добавит его во внутреннюю группу «Свои» - там сборки без проверки Apple.
 * Сертификатов, денег и других приложений команды он не видит.
 */
async function commandInvite(jwt) {
  const [email, firstName, lastName] = process.argv.slice(3);
  if (!email?.includes('@') || !firstName || !lastName) die('нужно: node Tools/asc.mjs invite <почта Apple ID> <имя> <фамилия>');
  const app = await findApp(jwt);
  if (!app) die(APP_MISSING);
  const lower = email.toLowerCase();

  const users = (await call(jwt, 'GET', '/users?limit=200&fields[users]=username')).data ?? [];
  if (users.some((u) => u.attributes.username?.toLowerCase() === lower)) {
    console.log(`${email} уже в команде - добавляю во внутреннюю группу`);
    return commandInternal(jwt);
  }

  const pending = (await call(jwt, 'GET', `/userInvitations?filter[email]=${encodeURIComponent(email)}&limit=10&fields[userInvitations]=email,expirationDate`)).data ?? [];
  if (pending.length) {
    const until = pending[0].attributes.expirationDate?.slice(0, 10);
    return console.log(`приглашение на ${email} уже отправлено${until ? `, действует до ${until}` : ''}. Когда примут: node Tools/asc.mjs internal`);
  }

  await call(jwt, 'POST', '/userInvitations', {
    data: {
      type: 'userInvitations',
      attributes: { email, firstName, lastName, roles: ['MARKETING'], allAppsVisible: false, provisioningAllowed: false },
      relationships: { visibleApps: { data: [{ type: 'apps', id: app.id }] } },
    },
  });
  console.log(`приглашение в App Store Connect отправлено на ${email} (роль «Маркетинг», только «${app.attributes.name}»).`);
  console.log('Когда его примут: node Tools/asc.mjs internal - и сборки придут в TestFlight без проверки Apple.');
}

/** Отозвать ещё не принятое приглашение в команду. */
async function commandUninvite(jwt) {
  const email = process.argv[3];
  if (!email?.includes('@')) die('нужно: node Tools/asc.mjs uninvite <почта>');
  const pending = (await call(jwt, 'GET', `/userInvitations?filter[email]=${encodeURIComponent(email)}&limit=10&fields[userInvitations]=email`)).data ?? [];
  if (!pending.length) return console.log(`неотвеченных приглашений на ${email} нет`);
  for (const inv of pending) await call(jwt, 'DELETE', `/userInvitations/${inv.id}`);
  console.log(`приглашение на ${email} отозвано, ссылка из письма больше не работает`);
}

const commands = {
  status: commandStatus, bundle: commandBundle, builds: commandBuilds, internal: commandInternal,
  external: commandExternal, submit: commandSubmit, link: commandLink, invite: commandInvite, uninvite: commandUninvite,
};
const name = process.argv[2] ?? 'status';
if (!commands[name]) die(`нет команды «${name}». Есть: ${Object.keys(commands).join(', ')}`);
await commands[name](token(credentials()));
