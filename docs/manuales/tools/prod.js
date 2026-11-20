const {abrir} = require('./cap.js');
(async () => {
  const {browser, page, U, errores} = await abrir('Producción', 'produccion-');
  const ver = async t => { await page.locator('text=' + t).first().scrollIntoViewIfNeeded().catch(()=>{}); await page.waitForTimeout(400); };
  await page.waitForTimeout(2000); await U.foto('01');
  console.log((await U.texto()).slice(0, 1500));
  await U.ir('#c-recibir'); await page.waitForTimeout(1200); await U.foto('02');
  console.log((await U.texto()).slice(0, 600));
  await U.ir('#pr-turno'); await page.waitForTimeout(1500); await U.marcar('Iniciar producción'); await U.foto('03');
  await ver('Terminar etapa'); await U.marcar('Terminar etapa'); await U.foto('04');
  await ver('Fritado'); await U.marcar('Fritado'); await U.foto('05');
  await ver('Anotar merma'); await U.marcar('Anotar merma y cerrar turno'); await U.foto('06');
  await ver('Resumen'); await U.foto('07');
  await U.ir('#inv-general'); await page.waitForTimeout(1000); await U.foto('08');
  await U.ir('#catprod'); await page.waitForTimeout(1000); await U.marcar('Quién recibe'); await U.foto('09');
  console.log('errores consola:', errores.length, errores.slice(0,3)); await browser.close();
})();
