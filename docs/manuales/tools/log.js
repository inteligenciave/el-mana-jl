const {abrir} = require('./cap.js');
(async () => {
  const {browser, page, U, errores} = await abrir('Logística', 'logistica-');
  const ver = async t => { await page.locator('text=' + t).first().scrollIntoViewIfNeeded().catch(()=>{}); await page.waitForTimeout(400); };
  await page.waitForTimeout(1500); await U.foto('01');
  await U.ir('#lg-empacar'); await page.waitForTimeout(1500); await U.marcar('"Anotar empaque"'); await U.foto('02');
  console.log((await U.texto()).slice(0, 1500));
  await U.ir('#em-tablero'); await page.waitForTimeout(1200); await U.marcar('Aragua'); await U.foto('03');
  await U.ir('#pr-zonas'); await page.waitForTimeout(1500); await U.foto('04');
  console.log((await U.texto()).slice(0, 800));
  await U.ir('#despachos'); await page.waitForTimeout(1500); await U.foto('05');
  console.log((await U.texto()).slice(0, 800));
  await U.ir('#mermas'); await page.waitForTimeout(1200);
  await page.locator('[data-cp-tab]', {hasText: 'Registrar merma'}).first().click().catch(()=>console.log('sin tab merma')); await page.waitForTimeout(900); await U.foto('06');
  await U.ir('#inventario'); await page.waitForTimeout(1200); await U.foto('09');
  await U.ir('#em-tablero'); await page.locator('text=Autorización').first().click(); await page.waitForTimeout(600);
  await page.locator('text=Pedir autorización').first().click().catch(()=>{}); await page.waitForTimeout(700); await U.foto('08');
  console.log(errores.length); await browser.close();
})();
