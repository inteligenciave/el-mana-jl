const {abrir} = require('./cap.js');
(async () => {
  const {browser, page, U, errores} = await abrir('Recursos humanos', 'recursos-humanos-');
  await U.foto('01');
  await U.ir('#rh-planta'); await U.marcar('"Marcar entrada"'); await U.foto('02');
  await U.marcar('Marcar entrada a todo el grupo'); await U.foto('03');
  await U.ir('#rh-grupos'); await U.foto('04');
  await U.ir('#personal'); await page.evaluate(() => { const h=[...document.querySelectorAll('h2,h3,h4')].find(x=>x.textContent.trim()==='Personal activo'); if(h){const c=h.closest('.card,section,article')||h.parentElement; c.style.visibility='hidden';} }); await U.marcar('Agregar persona'); await U.foto('05');
  await U.ir('#rh-params'); await U.marcar('Horario por turno'); await U.foto('06');
  await U.ir('#rh-lector'); await U.foto('07');
  await U.ir('#asistencia'); await U.marcar('Esta quincena'); await U.foto('08');
  await U.ir('#rh-bonos'); await U.marcar('Turno en vivo'); await U.foto('09');
  await U.ir('#rh-pagar'); await page.waitForTimeout(2500); await U.marcar('"Registrar pago"'); await U.foto('10');
  await page.locator('text=Registrar pago').first().click(); await page.waitForTimeout(900); await U.foto('11');
  await page.keyboard.press('Escape');
  await U.ir('#rh-planta'); await page.locator('text=Autorización').first().click(); await page.waitForTimeout(600);
  await page.locator('text=Pedir autorización').first().click().catch(()=>{}); await page.waitForTimeout(600); await U.foto('12');
  console.log('errores consola:', errores.length, errores.slice(0,3)); await browser.close();
})();
