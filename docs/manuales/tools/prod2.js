const {abrir} = require('./cap.js');
(async () => {
  const {browser, page, U, errores} = await abrir('Producción', 'produccion-');
  await U.ir('#pr-turno'); await page.waitForTimeout(2000); await U.marcar('Faltan bolsones', '"Iniciar producción"'); await U.foto('11');
  await U.ir('#c-recibir'); await page.waitForTimeout(1500); await U.marcar('Pedidas por recibir'); await U.foto('02');
  await U.ir('#inv-general'); await page.waitForTimeout(1200); await U.foto('09');
  await U.ir('#catprod'); await page.waitForTimeout(1000); await U.marcar('"Agregar"'); await U.foto('10');
  await U.ir('#pr-turno'); await page.locator('text=Autorización').first().click(); await page.waitForTimeout(600);
  await page.locator('text=Pedir autorización').first().click().catch(()=>{}); await page.waitForTimeout(700); await U.foto('12');
  console.log(errores.length); await browser.close();
})();
