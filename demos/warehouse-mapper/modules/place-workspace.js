/* Place context is fixed for the lifetime of a workspace page. */
(() => {
  const api=window.WarehouseModules.api;
  const context=api.context;
  if(!context)return;
  document.body.classList.add("managed-workspace");
  if(context.draft)document.body.classList.add("layout-draft");
  const style=document.createElement("link");style.rel="stylesheet";style.href="/workspace.css";document.head.append(style);
  const header=document.createElement("div");header.className="place-context-bar";
  const back=document.createElement("a");back.href=`/#${new URLSearchParams({place:context.placeId,map:context.mapId})}`;back.textContent="← Place & map library";
  const label=document.createElement("strong");label.textContent=context.draft?"Opening layout draft…":"Opening selected map…";
  const badge=document.createElement("span");badge.className="context-badge";badge.textContent=context.draft?"LAYOUT DRAFT":"PUBLISHED MAP";
  header.append(back,label,badge);document.body.prepend(header);
  const landing=document.querySelector(".landing-card");
  if(landing){
    landing.querySelector("h1").textContent="Place access";
    landing.querySelector("p").textContent="This workspace uses the access session from the place library.";
    const accessLink=back.cloneNode(true);accessLink.textContent="Open place library / sign in";landing.append(accessLink);
  }
  const help=document.createElement("div");help.className="place-workspace-help";
  help.textContent=context.draft?"Layout editing · saved changes stay in this draft. Return to the map library to review and publish. Inventory and audit writes are disabled here.":"Live inventory · select an area, rack, or pallet to inspect its contents. Layout changes are made in a separate draft from the map library.";
  document.querySelector(".topbar")?.after(help);
  window.addEventListener("place-context",()=>{
    label.textContent=`${context.placeName} / ${context.mapName}`;
    badge.textContent=context.draft?`DRAFT · based on r${context.published}`:`PUBLISHED r${context.published}`;
    document.title=`${context.mapName} · ${context.placeName} · Places`;
    const title=document.querySelector(".topbar h1");if(title)title.textContent=context.draft?"Layout studio":"Inventory workspace";
  });
  document.querySelectorAll('a[href="/field"],a[href="/manage"],a[href="/audit"]').forEach(link=>{
    link.href+=`?${new URLSearchParams({place:context.placeId,map:context.mapId})}`;
  });
  const configOption=document.querySelector('#viewMode option[value="config"]');
  if(configOption){configOption.textContent="Layout studio";if(!context.draft)configOption.disabled=true;}
  if(context.draft){
    document.querySelectorAll('#viewMode option[value="audit"],#viewMode option[value="management"]').forEach(option=>option.disabled=true);
  }
  let unsavedInventory=false;
  document.addEventListener("input",event=>{if(event.target.closest("#detailForm,#floatingInspector"))unsavedInventory=true;});
  window.addEventListener("place-inventory-saved",()=>unsavedInventory=false);
  window.addEventListener("beforeunload",event=>{
    if(unsavedInventory||window.WarehouseAppBridge?.state?.config?.dirty||window.WarehouseAppBridge?.state?.config?.mapSettingsDraft){event.preventDefault();event.returnValue="";}
  });
})();
