var db=null,user=null,assets=null,room=null,uid=null,cur="genel",chatType="room",chatPeer=null,unsubM=null,unsubReactions=null,unsubReads=null,names={},profs={},people=[],follows=[],notifications=[],reactionDocs=[],readDocs=[],lastDocs=[],feedDocs=[],typing={},rooms=[{id:"genel",name:"Genel"}];
var currentPage="home",chatGeneration=0;
var EM=["😀","😎","🦊","🐱","🐼","🦄","🔥","🌈","🚀","🎧","🍕","👾"],CL=["#5b4bdb","#e0457b","#e8833a","#2fa66a","#2b8fd9","#8a5cd0"];
var $=function(i){return document.getElementById(i)};
function gate(t,s){var m=$("msgs");m.innerHTML="";var d=document.createElement("div");d.className="gate";var h=document.createElement("h2");h.textContent=t;var p=document.createElement("div");p.textContent=s;d.appendChild(h);d.appendChild(p);m.appendChild(d)}
function nameOf(u){return (profs[u]&&profs[u].name)||names[u]||"Biri"}
function isId(x){return typeof x==="string"&&/^[0-9a-f]{32}$/.test(x)}
function avatar(u){var d=document.createElement("div");d.className="av";var p=profs[u]||{};d.style.background=CL.indexOf(p.color)>=0?p.color:CL[0];
 if(isId(p.photo)){var im=document.createElement("img");im.src=BU+p.photo;im.alt="";d.appendChild(im);return d}
 if(EM.indexOf(p.emoji)>=0)d.textContent=p.emoji;else{d.textContent=(nameOf(u)[0]||"?").toUpperCase();d.style.color="#fff";d.style.fontSize="15px";d.style.fontWeight="700"}return d}
function setAvatar(target,id){var source=avatar(id);target.textContent="";target.style.background=source.style.background;if(source.firstChild)target.appendChild(source.firstChild);else target.textContent=source.textContent}
function showPage(page){
  if(["home","messages","community","profile"].indexOf(page)<0)return;
  currentPage=page;
  document.querySelectorAll(".page-view").forEach(function(view){view.classList.toggle("active",view.id==="page-"+page)});
  document.querySelectorAll("[data-page]").forEach(function(button){button.classList.toggle("active",button.dataset.page===page)});
  if(location.hash!=="#"+page)history.replaceState(null,"","#"+page);
  if(page==="profile")renderProfile();
  if(page==="community")renderCommunity();
  if(page==="messages"&&lastDocs.length)render(lastDocs,chatGeneration);
}
function renderProfile(){
  if(!uid)return;
  var name=nameOf(uid);
  $("profileName").textContent=name;
  $("profileEmail").textContent=ME&&ME.email||"";
  $("sidebarName").textContent=name;
  $("me").textContent=name+"  ·  Profil";
  setAvatar($("profileAvatar"),uid);
  setAvatar($("composerAvatar"),uid);
  renderFeed(feedDocs);
}
function drawRooms(){var n=$("rooms");n.innerHTML="";rooms.forEach(function(r){var b=document.createElement("button");b.textContent=(r.visibility==="private"?"◆ ":"# ")+r.name;if(chatType==="room"&&r.id===cur)b.className="on";b.onclick=function(){openRoom(r.id)};n.appendChild(b)});if(chatType==="room"){var active=rooms.find(function(r){return r.id===cur});if(active)$("roomTitle").textContent=active.name}drawDms()}
function slug(s){return s.toLowerCase().replace(/[^a-z0-9ğüşöçı]+/g,"-").replace(/^-|-$/g,"").slice(0,30)||("oda-"+Date.now())}
function newRoom(){
  var name=prompt("Yeni özel oda adı?");
  if(!name||!name.trim())return;
  name=name.trim().slice(0,30);var id=slug(name);
  db.doc("rooms/"+id).set({name:name,uid:uid,owner:uid,visibility:"private",ts:Date.now()})
    .then(function(){return db.doc("room_members/"+id+"/"+uid).set({uid:uid,role:"owner",joinedAt:Date.now()})})
    .then(function(){openRoom(id)})
    .catch(function(error){alert("Oda oluşturulamadı: "+errm(error))});
}
function isFollowing(id){return follows.some(function(doc){var data=doc.data();return data.uid===uid&&data.target===id})}
function followsMe(id){return follows.some(function(doc){var data=doc.data();return data.uid===id&&data.target===uid})}
function isMutual(id){return isFollowing(id)&&followsMe(id)}
function relationDocId(from,to){return from+"_"+to}
function dmIdFor(a,b){return [a,b].sort().join("_")}
function drawDms(){
  var list=$("dmList");if(!list)return;list.textContent="";
  var peers=people.filter(function(person){return person.id!==uid&&isMutual(person.id)});
  if(!peers.length){var empty=document.createElement("div");empty.className="room-empty";empty.textContent="Karşılıklı takipte DM açılır";list.appendChild(empty);return}
  peers.forEach(function(person){var button=document.createElement("button");button.textContent="◌ "+nameOf(person.id);if(chatType==="dm"&&chatPeer===person.id)button.className="on";button.onclick=function(){openDm(person.id)};list.appendChild(button)});
}
function fmt(ts){return new Date(ts).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}
function renderFeed(docs){
  feedDocs=docs||[];
  var feed=$("feed"),own=$("profilePosts");
  if(!feed||!own)return;
  feed.textContent="";
  own.textContent="";
  if(!feedDocs.length){
    var empty=document.createElement("div");empty.className="empty-card";empty.textContent="Henüz paylaşım yok. İlk paylaşımı sen yap!";feed.appendChild(empty);
  }else feedDocs.forEach(function(doc){feed.appendChild(postCard(doc))});
  var mine=feedDocs.filter(function(doc){return doc.data().uid===uid});
  $("profilePostCount").textContent=mine.length+" paylaşım";
  if(!mine.length){
    var ownEmpty=document.createElement("div");ownEmpty.className="empty-card";ownEmpty.textContent="Paylaşımların burada görünecek.";own.appendChild(ownEmpty);
  }else mine.forEach(function(doc){own.appendChild(postCard(doc))});
}
function renderCommunity(){
  if(!$("peopleList"))return;
  var query=$("peopleSearch").value.trim().toLocaleLowerCase("tr-TR");
  var list=$("peopleList");list.textContent="";
  var matches=people.filter(function(person){return person.id!==uid&&nameOf(person.id).toLocaleLowerCase("tr-TR").indexOf(query)>=0});
  if(!matches.length){var empty=document.createElement("div");empty.className="empty-card";empty.textContent=query?"Eşleşen kişi bulunamadı.":"Henüz başka profil yok.";list.appendChild(empty)}
  matches.forEach(function(person){
    var row=document.createElement("div");row.className="person-row";
    var pic=document.createElement("div");pic.className="person-avatar";setAvatar(pic,person.id);
    var name=document.createElement("span");name.className="person-name";name.textContent=nameOf(person.id);
    row.appendChild(pic);row.appendChild(name);
    if(isMutual(person.id)){var dm=document.createElement("button");dm.className="person-action following";dm.type="button";dm.textContent="Mesaj";dm.onclick=function(){openDm(person.id);showPage("messages")};row.appendChild(dm)}
    var follow=document.createElement("button");follow.className="person-action"+(isFollowing(person.id)?" following":"");follow.type="button";follow.textContent=isFollowing(person.id)?"Takiptesin":"Takip et";follow.onclick=function(){toggleFollow(person.id)};row.appendChild(follow);
    list.appendChild(row);
  });
  var notices=$("notifications");notices.textContent="";
  var unread=notifications.filter(function(doc){return !doc.data().read});
  $("notificationCount").hidden=!unread.length;
  $("notificationCount").textContent=unread.length>99?"99+":String(unread.length);
  $("notificationPanelCount").textContent=unread.length+" yeni";
  if(!notifications.length){var none=document.createElement("div");none.className="empty-card";none.textContent="Bildirim yok.";notices.appendChild(none)}
  notifications.slice().reverse().forEach(function(doc){
    var data=doc.data(),item=document.createElement("div");item.className="notification-row"+(data.read?"":" unread");
    item.textContent=data.type==="room_invite"?nameOf(data.from)+" seni "+(rooms.find(function(room){return room.id===data.roomId})||{name:"özel bir oda"}).name+" odasına davet etti.":nameOf(data.from)+" seni takip etmeye başladı.";
    if(!data.read){var mark=document.createElement("button");mark.type="button";mark.textContent="Okundu";mark.onclick=function(){db.doc("notifications/"+uid+"/"+doc.id).set(Object.assign({},data,{read:true})).catch(function(error){alert("Bildirim güncellenemedi: "+errm(error))})};item.appendChild(mark)}
    notices.appendChild(item);
  });
  drawDms();
}
async function toggleFollow(target){
  var id=relationDocId(uid,target),path="follows/"+id;
  try{
    if(isFollowing(target)){
      await db.doc(path).delete();
    }else{
      await db.doc(path).set({uid:uid,target:target,ts:Date.now()});
      await db.doc("notifications/"+target+"/"+rid()).set({uid:target,target:target,from:uid,type:"follow",read:false,ts:Date.now()});
    }
  }catch(error){alert("Takip işlemi tamamlanamadı: "+errm(error))}
}
async function openDm(peer){
  if(!isMutual(peer)){alert("Özel mesaj için birbirinizi takip etmelisiniz.");return}
  var id=dmIdFor(uid,peer);
  try{
    var existing=await db.doc("dm/"+id).get();
    if(!existing){
      await db.doc("dm/"+id).set({uid:uid,members:[uid,peer],ts:Date.now()});
    }
    showPage("messages");openChat(id,"dm",peer);
  }catch(error){alert("Özel mesaj açılamadı: "+errm(error))}
}
function postCard(doc){
  var data=doc.data(),card=document.createElement("article");card.className="post-card";
  var author=document.createElement("div");author.className="post-author";
  var picture=document.createElement("div");picture.className="post-avatar";setAvatar(picture,data.uid);author.appendChild(picture);
  var copy=document.createElement("div");copy.className="post-author-copy";
  var authorName=document.createElement("strong");authorName.textContent=nameOf(data.uid);
  var time=document.createElement("time");time.dateTime=data.ts?new Date(data.ts).toISOString():"";time.textContent=data.ts?new Date(data.ts).toLocaleString("tr-TR",{dateStyle:"medium",timeStyle:"short"}):"Şimdi";
  copy.appendChild(authorName);copy.appendChild(time);author.appendChild(copy);
  if(data.uid===uid){
    var menu=document.createElement("button");menu.className="post-menu";menu.type="button";menu.textContent="···";menu.setAttribute("aria-label","Paylaşım seçenekleri");
    menu.onclick=function(){if(confirm("Bu paylaşım silinsin mi?"))db.doc("posts/"+doc.id).delete().catch(function(){alert("Paylaşım silinemedi.")})};
    author.appendChild(menu);
  }
  var content=document.createElement("p");content.className="post-content";content.textContent=data.text||"";
  var footer=document.createElement("div");footer.className="post-footer";footer.appendChild(document.createTextNode("✦  Vercell topluluğunda paylaşıldı"));
  if(data.uid===uid){var remove=document.createElement("button");remove.className="post-delete";remove.type="button";remove.textContent="Sil";remove.onclick=function(){if(confirm("Bu paylaşım silinsin mi?"))db.doc("posts/"+doc.id).delete().catch(function(){alert("Paylaşım silinemedi.")})};footer.appendChild(remove)}
  card.appendChild(author);card.appendChild(content);card.appendChild(footer);return card;
}
async function render(docs,generation){
  lastDocs=docs;var ids=[];docs.forEach(function(d){var u=d.data().uid;if(u&&!names[u]&&ids.indexOf(u)<0)ids.push(u)});
  if(ids.length){try{var ps=await user.profiles(ids);ids.forEach(function(i){names[i]=(ps[i]&&ps[i].name)||"Biri"})}catch(e){ids.forEach(function(i){names[i]="Biri"})}}
  if(generation!==undefined&&generation!==chatGeneration)return;
  var m=$("msgs"),near=m.scrollHeight-m.scrollTop-m.clientHeight<120;m.innerHTML="";
  if(!docs.length){var e=document.createElement("div");e.className="empty";e.textContent="Henüz mesaj yok. İlk mesajı sen yaz!";m.appendChild(e);return}
  docs.forEach(function(d){var x=d.data(),mine=x.uid===uid;
    if(x.event==="leave"){var system=document.createElement("div");system.className="empty-card";system.textContent=x.text||nameOf(x.uid)+" çıktı";m.appendChild(system);return}
    var r=document.createElement("div");r.className="row"+(mine?" me":"");
    r.appendChild(avatar(x.uid));var w=document.createElement("div");w.className="m"+(mine?" me":"");
    if(!mine){var n=document.createElement("div");n.className="n";n.textContent=nameOf(x.uid);w.appendChild(n)}
    var b=document.createElement("div");b.className="b";
    if(x.replyTo){var quote=document.createElement("div");quote.className="message-quote";quote.textContent="↳ "+(x.replyTo.name||"Mesaj")+" · "+(x.replyTo.text||"");b.appendChild(quote)}
    if(x.img&&/^[0-9a-f]{32}$/.test(x.img)){var im=document.createElement("img");im.src=BU+x.img;im.alt="Fotoğraf";im.onclick=function(){window.open(im.src,"_blank")};b.appendChild(im)}
    if(isId(x.audio)){var au=document.createElement("audio");au.controls=true;au.preload="none";au.src=BU+x.audio;b.appendChild(au)}
    if(x.text){var sp=document.createElement("span");sp.textContent=x.text;b.appendChild(sp)}
    w.appendChild(b);
    var messageReactions=reactionDocs.filter(function(item){return item.data().messageId===d.id}),reactionBar=document.createElement("div");reactionBar.className="message-reactions";
    messageReactions.forEach(function(item){var chip=document.createElement("button");chip.className="reaction-chip";chip.type="button";chip.textContent=item.data().emoji+" "+nameOf(item.data().uid);chip.onclick=function(){toggleReaction(d.id,item.data().emoji)};reactionBar.appendChild(chip)});
    if(messageReactions.length)w.appendChild(reactionBar);
    var t=document.createElement("div");t.className="t";t.textContent=fmt(x.ts);w.appendChild(t);
    var actions=document.createElement("div");actions.className="message-actions";
    var reply=document.createElement("button");reply.className="message-action";reply.type="button";reply.textContent="Yanıtla";reply.onclick=function(){replyToMessage(d.id,x)};actions.appendChild(reply);
    var react=document.createElement("button");react.className="message-action";react.type="button";react.textContent="Tepki";react.onclick=function(){showReactionPicker(actions,d.id)};actions.appendChild(react);
    if(mine){
      var del=document.createElement("button");del.className="message-action";del.type="button";del.textContent="Sil";del.onclick=function(){if(confirm("Mesaj silinsin mi?"))db.doc(messagePath()+"/"+d.id).delete().catch(function(){alert("Mesaj silinemedi.")})};actions.appendChild(del);
      if(readDocs.some(function(item){return item.data().messageId===d.id&&item.data().uid!==uid})){var seen=document.createElement("span");seen.className="message-seen";seen.textContent="Görüldü";actions.appendChild(seen)}
    }
    w.appendChild(actions);r.appendChild(w);m.appendChild(r);
    if(!mine&&currentPage==="messages"&&docs.indexOf(d)>=Math.max(0,docs.length-50))markMessageRead(d.id);
  });
  if(near||m.dataset.first!==cur){m.scrollTop=m.scrollHeight;m.dataset.first=cur}
}
function messagePath(){return chatType==="dm"?"dm/"+cur+"/msgs":"rooms/"+cur+"/msgs"}
function sideCollection(kind){return (chatType==="dm"?"dm_":"room_")+kind+"/"+cur}
function stopChatListeners(){[unsubM,unsubReactions,unsubReads].forEach(function(stop){if(stop)stop()});unsubM=unsubReactions=unsubReads=null}
function openRoom(id){openChat(id,"room",null)}
function openChat(id,type,peer){
  stopChatListeners();chatGeneration++;var generation=chatGeneration;cur=id;chatType=type;chatPeer=peer;typing={};reactionDocs=[];readDocs=[];lastDocs=[];replyDraft=null;markedRead={};updateReplyPreview();showTyping();drawRooms();
  var selected=rooms.find(function(item){return item.id===id}),title=type==="dm"?nameOf(peer):(selected?selected.name:id);
  $("roomTitle").textContent=title;$("roomTitle").parentElement.previousElementSibling.textContent=type==="dm"?"◌":"#";
  $("msgs").innerHTML='<div class="empty-card">Yükleniyor…</div>';$("msgs").dataset.first="";
  unsubM=db.collection(messagePath()).orderBy("ts","asc").limit(200).onSnapshot(function(s){render(s.docs,generation)},function(error){gate("Hata","Mesajlar yüklenemedi: "+errm(error))});
  unsubReactions=db.collection(sideCollection("reactions")).onSnapshot(function(s){if(generation!==chatGeneration)return;reactionDocs=s.docs;render(lastDocs,generation)},function(error){console.error("Tepkiler yüklenemedi",error)});
  unsubReads=db.collection(sideCollection("reads")).onSnapshot(function(s){if(generation!==chatGeneration)return;readDocs=s.docs;render(lastDocs,generation)},function(error){console.error("Okundu bilgileri yüklenemedi",error)});
}
var replyDraft=null,markedRead={};
function updateReplyPreview(){
  var preview=$("replyPreview");if(!preview)return;
  preview.hidden=!replyDraft;
  if(replyDraft)$("replyLabel").textContent="Yanıt: "+replyDraft.name+" · "+replyDraft.text.slice(0,100);
}
function replyToMessage(id,data){replyDraft={id:id,uid:data.uid,name:nameOf(data.uid),text:data.text||"Fotoğraf / ses"};updateReplyPreview();$("inp").focus()}
function markMessageRead(id){
  if(!id||markedRead[id])return;
  markedRead[id]=true;
  db.doc(sideCollection("reads")+"/"+id+"_"+uid).set({uid:uid,messageId:id,ts:Date.now()}).catch(function(error){markedRead[id]=false;console.error("Okundu bilgisi kaydedilemedi",error)});
}
function toggleReaction(id,emoji){
  var path=sideCollection("reactions")+"/"+id+"_"+uid;
  var current=reactionDocs.find(function(item){return item.id===id+"_"+uid});
  var action=current&&current.data().emoji===emoji?db.doc(path).delete():db.doc(path).set({uid:uid,messageId:id,emoji:emoji,ts:Date.now()});
  action.catch(function(error){alert("Tepki kaydedilemedi: "+errm(error))});
}
function showReactionPicker(container,id){
  var previous=container.querySelector(".reaction-picker");if(previous){previous.remove();return}
  var picker=document.createElement("span");picker.className="reaction-picker";
  ["❤️","👍","😂","😮","😢","🔥"].forEach(function(emoji){var button=document.createElement("button");button.type="button";button.textContent=emoji;button.onclick=function(){toggleReaction(id,emoji);picker.remove()};picker.appendChild(button)});
  container.appendChild(picker);
}
var roomMemberDocs=[],roomMemberStop=null,roomMeta=null;
function fillMemberSelect(select,allowOwner){
  select.innerHTML='<option value="">Üye seç</option>';
  roomMemberDocs.forEach(function(doc){
    var data=doc.data();
    if(data.uid===uid||(!allowOwner&&data.role==="owner"))return;
    var option=document.createElement("option");option.value=data.uid;option.textContent=nameOf(data.uid);select.appendChild(option);
  });
}
function showRoomInfo(){
  if(chatType!=="room"){alert("Özel mesaj üyeleri ve ayarları karşılıklı takip durumundan yönetilir.");return}
  roomMeta=rooms.find(function(item){return item.id===cur});
  if(!roomMeta){alert("Oda bilgisi yüklenemedi.");return}
  $("roomModalTitle").textContent=roomMeta.name;
  $("roomOwner").textContent="Sahip: "+nameOf(roomMeta.owner||roomMeta.uid||"");
  $("roomRename").value=roomMeta.name;
  var isOwner=roomMeta.owner===uid;
  $("roomAdminControls").hidden=!(isOwner||roomMeta.admins&&roomMeta.admins.indexOf(uid)>=0);
  $("roomRenameControls").hidden=!isOwner;
  $("roomAdminSelect").hidden=!isOwner;$("grantRoomAdmin").hidden=!isOwner;
  $("roomTransferControls").hidden=roomMeta.owner!==uid;
  if(roomMemberStop)roomMemberStop();
  roomMemberStop=db.collection("room_members/"+cur).onSnapshot(function(snapshot){
    roomMemberDocs=snapshot.docs;
    var isOwner=roomMeta.owner===uid,member=roomMemberDocs.find(function(doc){return doc.data().uid===uid}),isManager=isOwner||member&&["owner","admin"].indexOf(member.data().role)>=0;
    $("roomAdminControls").hidden=!isManager;$("roomAdminSelect").hidden=!isOwner;$("grantRoomAdmin").hidden=!isOwner;
    $("roomRenameControls").hidden=!isOwner;
    $("roomMemberCount").textContent=roomMemberDocs.length+" kişi";
    var list=$("roomMembers");list.textContent="";
    roomMemberDocs.forEach(function(doc){
      var data=doc.data(),item=document.createElement("div");item.className="room-member-row";item.textContent=nameOf(data.uid);
      if(data.role==="owner"||data.role==="admin"){var role=document.createElement("strong");role.textContent=data.role==="owner"?"Sahip":"Yönetici";item.appendChild(role)}
      list.appendChild(item);
    });
    fillMemberSelect($("roomAdminSelect"),false);
    fillMemberSelect($("roomTransferSelect"),false);
    fillInviteSelect();
  },function(error){console.error("Oda üyeleri yüklenemedi",error);$("roomMembers").textContent="Üyeler yüklenemedi."});
  $("leaveRoom").hidden=cur==="genel";
  $("roomModal").className="modal-overlay on";
}
function fillInviteSelect(){
  var select=$("roomInviteSelect");select.innerHTML='<option value="">Kişi seç</option>';
  people.filter(function(person){return !roomMemberDocs.some(function(doc){return doc.data().uid===person.id})}).forEach(function(person){
    var option=document.createElement("option");option.value=person.id;option.textContent=nameOf(person.id);select.appendChild(option);
  });
}
function saveRoomName(){
  var name=$("roomRename").value.trim().slice(0,30);
  if(!name)return;
  var data=Object.assign({},roomMeta,{name:name});
  db.doc("rooms/"+cur).set(data).then(function(){$("roomModalTitle").textContent=name;openRoom(cur)}).catch(function(error){alert("Oda adı değiştirilemedi: "+errm(error))});
}
function grantRoomAdmin(){
  var target=$("roomAdminSelect").value;if(!target)return;
  db.doc("room_members/"+cur+"/"+target).set({uid:target,role:"admin"}).then(showRoomInfo).catch(function(error){alert("Yönetici atanamadı: "+errm(error))});
}
function inviteRoomMember(){
  var target=$("roomInviteSelect").value;if(!target)return;
  db.doc("room_members/"+cur+"/"+target).set({uid:target,role:"member",joinedAt:Date.now()})
    .then(function(){return db.doc("notifications/"+target+"/"+rid()).set({uid:target,target:target,from:uid,type:"room_invite",roomId:cur,read:false,ts:Date.now()})})
    .then(showRoomInfo).catch(function(error){alert("Üye eklenemedi: "+errm(error))});
}
function transferRoomOwner(){
  var target=$("roomTransferSelect").value;if(!target)return;
  if(!confirm(nameOf(target)+" odanın yeni sahibi olsun mu?"))return;
  var meta=Object.assign({},roomMeta,{owner:target,admins:(roomMeta.admins||[]).filter(function(id){return id!==target})});
  db.doc("room_members/"+cur+"/"+target).set({uid:target,role:"owner"})
    .then(function(){return db.doc("rooms/"+cur).set(meta)})
    .then(function(){return db.doc("room_members/"+cur+"/"+uid).set({uid:uid,role:"admin"})})
    .then(function(){$("roomModal").className="modal-overlay";openRoom(cur)})
    .catch(function(error){alert("Oda sahipliği devredilemedi: "+errm(error))});
}
async function leaveRoom(){
  if(cur==="genel"){alert("Genel odadan çıkılamaz.");return}
  var membership=roomMemberDocs.find(function(doc){return doc.data().uid===uid}),role=membership&&membership.data().role;
  if(role==="owner"){alert("Odadan çıkmadan önce sahipliği başka bir üyeye devret.");return}
  if(!confirm("Odadan çıkmak istiyor musun? Diğer üyeler '"+nameOf(uid)+" çıktı' mesajını görecek."))return;
  try{
    await db.collection(messagePath()).add({uid:uid,ts:Date.now(),event:"leave",text:nameOf(uid)+" çıktı"});
    await db.doc("room_members/"+cur+"/"+uid).delete();
    $("roomModal").className="modal-overlay";openRoom("general");
  }catch(error){alert("Odadan çıkılamadı: "+errm(error))}
}
function addTo(path,o){o.uid=uid;o.ts=Date.now();return db.collection(path).add(o)}
function add(o){if(replyDraft)o.replyTo=replyDraft;return addTo(messagePath(),o).then(function(result){replyDraft=null;updateReplyPreview();return result})}
function send(){var v=$("inp").value.trim();if(!v)return;$("inp").value="";add({text:v}).catch(function(){$("inp").value=v;alert("Gönderilemedi. Yazma iznin olmayabilir.")})}
async function sharePost(event){
  event.preventDefault();
  var input=$("postText"),button=$("postSubmit"),text=input.value.trim();
  if(!text)return;
  button.disabled=true;
  try{await addTo("posts",{text:text});input.value=""}
  catch(error){alert("Paylaşım gönderilemedi: "+errm(error))}
  finally{button.disabled=false}
}
/* yazıyor */
var lastEmit=0;
function emitTyping(){var n=Date.now();if(!room||n-lastEmit<2000)return;lastEmit=n;room.emit("typing",{room:cur}).catch(function(){})}
function showTyping(){var n=Date.now(),a=[];Object.keys(typing).forEach(function(u){if(n-typing[u]<3500)a.push(nameOf(u));else delete typing[u]});
  $("typ").textContent=a.length?(a.length>2?"Birkaç kişi yazıyor…":a.join(", ")+" yazıyor…"):""}
setInterval(showTyping,1000);
/* fotoğraf / ses / gif */
function shrink(f,max,sq){return new Promise(function(ok,no){var im=new Image(),u=URL.createObjectURL(f);im.onload=function(){var c=document.createElement("canvas"),g=c.getContext("2d");
  if(sq){var s=Math.min(im.width,im.height);c.width=c.height=max;g.drawImage(im,(im.width-s)/2,(im.height-s)/2,s,s,0,0,max,max)}
  else{var k=Math.min(1,max/Math.max(im.width,im.height));c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);g.drawImage(im,0,0,c.width,c.height)}
  URL.revokeObjectURL(u);c.toBlob(function(b){b?ok(b):no()},"image/jpeg",.82)};im.onerror=no;im.src=u})}
function errm(e){return (e&&(e.code||e.message))||String(e)}
function need(){if(assets)return true;alert("Dosya yüklenemedi. Supabase Storage içindeki media kovasını ve oturumunu kontrol et.");return false}
function busy(v){["pg","pcam","pgif","mic"].forEach(function(i){$(i).disabled=v})}
async function sendPhoto(f){if(!f||!/^image\//.test(f.type)||!need())return;busy(true);
  try{var b=f.type==="image/gif"?f:await shrink(f,1280),r=await assets.upload(b);await add({img:r.id,text:""})}catch(e){alert("Gönderilemedi.: "+errm(e))}
  busy(false);$("fg").value="";$("fc").value=""}
var rec=null,rtm=0;
async function toggleRec(){
  if(!rec&&(!need()||!window.MediaRecorder||!navigator.mediaDevices)){if(assets)alert("Bu tarayıcı ses kaydını desteklemiyor.");return}
  if(rec){rec.stop();return}
  var st;try{st=await navigator.mediaDevices.getUserMedia({audio:true})}catch(e){alert("Mikrofon açılamadı: "+errm(e));return}
  var web=MediaRecorder.isTypeSupported("audio/webm"),ch=[],t0=Date.now();
  rec=new MediaRecorder(st,web?{mimeType:"audio/webm"}:undefined);
  rec.ondataavailable=function(e){if(e.data.size)ch.push(e.data)};
  rec.onstop=async function(){st.getTracks().forEach(function(t){t.stop()});clearInterval(rtm);rec=null;$("mic").textContent="🎤";$("mic").classList.remove("rec");
    if(ch.length&&Date.now()-t0>600){busy(true);try{var b=new Blob(ch,{type:web?"audio/webm":"audio/mp4"}),r=await assets.upload(b);await add({audio:r.id,text:""})}catch(e){alert("Sesli mesaj gönderilemedi.: "+errm(e))}busy(false)}};
  rec.start();$("mic").classList.add("rec");rtm=setInterval(function(){var n=Math.round((Date.now()-t0)/1000);$("mic").textContent="⏹ "+n+"s";if(n>=60)rec.stop()},500)}
/* GIF üretici: 8 bit renk (3-3-2), kendi LZW kodlayıcımız */
function lzw(ix){var out=[],cur=0,bits=0,cs=9,nx=258,d=new Map();function put(c){cur|=c<<bits;bits+=cs;while(bits>=8){out.push(cur&255);cur>>=8;bits-=8}}
  put(256);var p=ix[0];for(var i=1;i<ix.length;i++){var k=ix[i],key=p*256+k,v=d.get(key);
    if(v!==undefined){p=v}else{put(p);if(nx<4096){d.set(key,nx++);if(nx>(1<<cs)&&cs<12)cs++}else{put(256);d.clear();nx=258;cs=9}p=k}}
  put(p);put(257);if(bits>0)out.push(cur&255);return out}
function encodeGIF(fr,w,h,dl){var o=[71,73,70,56,57,97,w&255,w>>8,h&255,h>>8,247,0,0];
  for(var i=0;i<256;i++)o.push(Math.round(((i>>5)&7)*255/7),Math.round(((i>>2)&7)*255/7),Math.round((i&3)*255/3));
  o.push(33,255,11,78,69,84,83,67,65,80,69,50,46,48,3,1,0,0,0);
  fr.forEach(function(ix){o.push(33,249,4,0,dl&255,dl>>8,0,0,44,0,0,0,0,w&255,w>>8,h&255,h>>8,0,8);
    var z=lzw(ix);for(var p=0;p<z.length;p+=255){var n=Math.min(255,z.length-p);o.push(n);for(var q=0;q<n;q++)o.push(z[p+q])}o.push(0)});
  o.push(59);return new Uint8Array(o)}
var gifFiles=[];
function gmDraw(){var t=$("gt");t.innerHTML="";gifFiles.forEach(function(f,i){var im=document.createElement("img");im.src=URL.createObjectURL(f);im.style.cssText="width:56px;height:56px;object-fit:cover;border-radius:8px;cursor:pointer";im.onclick=function(){gifFiles.splice(i,1);gmDraw()};t.appendChild(im)});$("gok").disabled=gifFiles.length<2}
function gmAdd(fs){[].forEach.call(fs,function(f){if(/^image\//.test(f.type)&&gifFiles.length<12)gifFiles.push(f)});gmDraw();$("fgm").value="";$("fgc").value=""}
async function makeGif(){if(!need())return;var ok=$("gok");ok.disabled=true;ok.textContent="Hazırlanıyor…";
  try{var bm=await Promise.all(gifFiles.map(function(f){return createImageBitmap(f)}));
    var k=Math.min(1,320/Math.max(bm[0].width,bm[0].height)),w=Math.max(2,Math.round(bm[0].width*k)),h=Math.max(2,Math.round(bm[0].height*k));
    var c=document.createElement("canvas");c.width=w;c.height=h;var g=c.getContext("2d"),fr=[];
    bm.forEach(function(b){var s=Math.max(w/b.width,h/b.height),dw=b.width*s,dh=b.height*s;g.fillStyle="#000";g.fillRect(0,0,w,h);g.drawImage(b,(w-dw)/2,(h-dh)/2,dw,dh);
      var px=g.getImageData(0,0,w,h).data,ix=new Uint8Array(w*h);for(var i=0;i<ix.length;i++)ix[i]=(px[i*4]>>5<<5)|(px[i*4+1]>>5<<2)|(px[i*4+2]>>6);fr.push(ix)});
    var blob=new Blob([encodeGIF(fr,w,h,+$("gs").value)],{type:"image/gif"}),r=await assets.upload(blob);await add({img:r.id,text:""});
    $("gm").className="modal-overlay";gifFiles=[]}catch(e){alert("GIF oluşturulamadı.: "+errm(e))}
  ok.textContent="Gönder";gmDraw()}
/* profil */
var draft={};
function pvDraw(){var p=$("pv");p.innerHTML="";p.style.background=draft.color;
  if(isId(draft.photo)){var im=document.createElement("img");im.src=BU+draft.photo;p.appendChild(im)}else p.textContent=draft.emoji;
  [].forEach.call($("pe").children,function(b){b.className=!draft.photo&&b.textContent===draft.emoji?"sel":""});
  [].forEach.call($("pcl").children,function(b){b.className=b.dataset.c===draft.color?"sel":""})}
function openProf(){var p=profs[uid]||{};draft={emoji:EM.indexOf(p.emoji)>=0?p.emoji:EM[0],color:CL.indexOf(p.color)>=0?p.color:CL[0],photo:isId(p.photo)?p.photo:""};
  $("pn").value=p.name||names[uid]||"";$("pe").innerHTML="";$("pcl").innerHTML="";
  EM.forEach(function(e){var b=document.createElement("button");b.textContent=e;b.onclick=function(){draft.emoji=e;draft.photo="";pvDraw()};$("pe").appendChild(b)});
  CL.forEach(function(c){var b=document.createElement("button");b.dataset.c=c;b.style.background=c;b.onclick=function(){draft.color=c;pvDraw()};$("pcl").appendChild(b)});
  pvDraw();$("pm").className="modal-overlay on"}
async function profPhoto(f){if(!f||!/^image\//.test(f.type)||!need())return;try{var r=await assets.upload(await shrink(f,256,true));draft.photo=r.id;pvDraw()}catch(e){alert("Fotoğraf yüklenemedi.: "+errm(e))}$("fpg").value="";$("fpc").value=""}
$("pc").onclick=function(){$("pm").className="modal-overlay"};
$("ps").onclick=function(){var nm=$("pn").value.trim().slice(0,24);db.doc("profiles/"+uid).set({name:nm,emoji:draft.emoji,color:draft.color,photo:draft.photo||""}).then(function(){$("pm").className="modal-overlay"}).catch(function(){alert("Profil kaydedilemedi.")})};
$("pfg").onclick=function(){$("fpg").click()};$("pfc").onclick=function(){$("fpc").click()};$("pfx").onclick=function(){draft.photo="";pvDraw()};
$("fpg").onchange=function(){profPhoto($("fpg").files[0])};$("fpc").onchange=function(){profPhoto($("fpc").files[0])};
$("pg").onclick=function(){$("fg").click()};$("pcam").onclick=function(){$("fc").click()};
$("fg").onchange=function(){sendPhoto($("fg").files[0])};$("fc").onchange=function(){sendPhoto($("fc").files[0])};
$("mic").onclick=toggleRec;
$("pgif").onclick=function(){gifFiles=[];gmDraw();$("gm").className="modal-overlay on"};$("gx").onclick=function(){$("gm").className="modal-overlay"};
$("gg").onclick=function(){$("fgm").click()};$("gc").onclick=function(){$("fgc").click()};
$("fgm").onchange=function(){gmAdd($("fgm").files)};$("fgc").onchange=function(){gmAdd($("fgc").files)};$("gok").onclick=makeGif;
$("me").onclick=function(){if(db&&uid)showPage("profile")};
$("editProfile").onclick=function(){if(db&&uid)openProf()};
$("postForm").onsubmit=sharePost;
document.querySelectorAll("[data-page]").forEach(function(button){button.onclick=function(){showPage(button.dataset.page)}});
document.querySelector("[data-page-link]").onclick=function(event){event.preventDefault();showPage("home")};
$("send").onclick=send;$("inp").onkeydown=function(e){if(e.key==="Enter"){e.preventDefault();send()}};
$("inp").oninput=emitTyping;
$("cancelReply").onclick=function(){replyDraft=null;updateReplyPreview()};
$("roomInfo").onclick=showRoomInfo;
$("newRoom").onclick=newRoom;
$("closeRoomModal").onclick=$("dismissRoomModal").onclick=function(){$("roomModal").className="modal-overlay";if(roomMemberStop){roomMemberStop();roomMemberStop=null}};
$("saveRoomName").onclick=saveRoomName;
$("grantRoomAdmin").onclick=grantRoomAdmin;
$("inviteRoomMember").onclick=inviteRoomMember;
$("transferRoomOwner").onclick=transferRoomOwner;
$("leaveRoom").onclick=leaveRoom;
$("peopleSearch").oninput=renderCommunity;
window.addEventListener("hashchange",function(){showPage(location.hash.slice(1)||"home")});
async function startApp(){
  drawRooms();
  try{db=await claude.use("db");user=await claude.use("user")}catch(error){console.error("Supabase servisleri başlatılamadı",error)}
  if(!db||!user){gate("Vercell","Sohbet için Supabase hesabınla giriş yapman gerekiyor.");return}
  uid=await user.id();var me=await user.me();names[uid]=me.name||"Sen";
  try{assets=await claude.use("assets")}catch(e){}["pg","pcam","pgif","mic"].forEach(function(i){$(i).hidden=false});
  try{room=await claude.use("room");if(room)room.on("typing",function(m){if(m.isMe||!m.by||!m.data||m.data.room!==cur)return;typing[m.by]=Date.now();showTyping()})}catch(e){}
  var canW=user.can("data.write")!==false;
  $("inp").disabled=!canW;$("send").disabled=!canW;busy(!canW);if(!canW)$("inp").placeholder="Yazma iznin yok (yalnızca okuyabilirsin)";
  db.collection("profiles").onSnapshot(function(s){profs={};people=s.docs.map(function(d){profs[d.id]=d.data();names[d.id]=d.data().name||names[d.id]||"Biri";return {id:d.id,data:d.data()}});if(!profs[uid]&&!window.__seed){window.__seed=1;db.doc("profiles/"+uid).set({name:names[uid]||"",emoji:"",color:CL[0],photo:""})}renderProfile();renderCommunity();if(lastDocs.length)render(lastDocs);if(feedDocs.length)renderFeed(feedDocs)},function(error){console.error("Profiller yüklenemedi",error)});
  db.collection("follows").onSnapshot(function(s){follows=s.docs;renderCommunity()},function(error){console.error("Takip listesi yüklenemedi",error)});
  db.collection("notifications/"+uid).orderBy("ts","asc").limit(100).onSnapshot(function(s){notifications=s.docs;renderCommunity()},function(error){console.error("Bildirimler yüklenemedi",error)});
  db.collection("rooms").onSnapshot(function(s){
    var map={genel:{id:"genel",name:"Genel",owner:"",visibility:"public"}};
    s.docs.forEach(function(d){var data=d.data();map[d.id]={id:d.id,name:data.name||d.id,owner:data.owner||data.uid||"",uid:data.uid||"",admins:data.admins||[],visibility:data.visibility||"public"}});
    rooms=Object.keys(map).map(function(k){return map[k]});drawRooms()},function(error){console.error("Odalar yüklenemedi",error)});
  db.doc("room_members/general/"+uid).get().then(function(member){if(!member)return db.doc("room_members/general/"+uid).set({uid:uid,role:"member",joinedAt:Date.now()})}).catch(function(error){console.error("Genel oda üyeliği oluşturulamadı",error)});
  $("me").textContent=nameOf(uid)+"  ·  Profil";openRoom("genel");
  db.collection("posts").orderBy("ts","desc").limit(100).onSnapshot(function(s){renderFeed(s.docs)},function(){var feed=$("feed");feed.textContent="";var error=document.createElement("div");error.className="empty-card";error.textContent="Akış yüklenemedi. Supabase docs tablosu ve erişim kurallarını kontrol et.";feed.appendChild(error)});
  showPage(["home","messages","community","profile"].indexOf(location.hash.slice(1))>=0?location.hash.slice(1):"home");
}

/* ---- Supabase bağdaştırıcısı: uygulama kodunu değiştirmeden db/user/assets/room sağlar ---- */
var CFG=window.VERCELL_CONFIG||{},BU=(CFG.url||"")+"/storage/v1/object/public/media/",sb=null,ME=null;
function rid(){return crypto.randomUUID().replace(/-/g,"")}
function split(p){var i=p.lastIndexOf("/");return {c:p.slice(0,i),id:p.slice(i+1)}}
function chk(r){if(r&&r.error)throw r.error;return r}
function frontendKeyAllowed(key){
  if(typeof key!=="string")return false;
  if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))return true;
  var parts=key.split(".");
  if(parts.length!==3)return false;
  try{
    var payload=parts[1].replace(/-/g,"+").replace(/_/g,"/");
    payload+=new Array((4-payload.length%4)%4+1).join("=");
    return JSON.parse(atob(payload)).role==="anon";
  }catch(e){return false}
}
function mkDb(){
  function put(c,id,d){return sb.from("docs").upsert({collection:c,id:id,data:d}).then(chk)}
  function col(path){var f={o:null,d:"asc",l:500},q={};
    q.orderBy=function(x,direction){f.o=x;f.d=direction==="desc"?"desc":"asc";return q};q.limit=function(n){f.l=n;return q};
    q.add=function(d){return put(path,rid(),d)};
    q.onSnapshot=function(next,err){var rows=[],pending={},loaded=false;
      function emit(){var r=rows.slice();if(f.o)r.sort(function(a,b){
          var av=f.o==="ts"&&a.created_at?a.created_at:(a.data[f.o]||0);
          var bv=f.o==="ts"&&b.created_at?b.created_at:(b.data[f.o]||0);
          if(av!==bv)return (av<bv?-1:1)*(f.d==="desc"?-1:1);
          return a.id<b.id?-1:a.id>b.id?1:0
        });
        var selected=f.d==="desc"?r.slice(0,f.l):r.slice(-f.l);
        var docs=selected.map(function(x){return {id:x.id,data:function(){
          if(x.created_at&&typeof x.data.ts==="number")return Object.assign({},x.data,{ts:Date.parse(x.created_at)});
          return x.data
        }}});next({docs:docs,size:docs.length,empty:!docs.length})}
      function drop(id){rows=rows.filter(function(x){return x.id!==id})}
      sb.from("docs").select("id,data,created_at").eq("collection",path).limit(1000).then(function(r){
        if(r.error){if(err)err(r.error);return}
        rows=r.data;
        Object.keys(pending).forEach(function(id){drop(id);if(pending[id])rows.push(pending[id])});
        loaded=true;emit()
      });
      var ch=sb.channel("c"+rid()).on("postgres_changes",{event:"*",schema:"public",table:"docs",filter:"collection=eq."+path},function(p){
          if(p.eventType==="DELETE"){
            if(!loaded)pending[p.old.id]=null;
            drop(p.old.id)
          }else{
            var row={id:p.new.id,data:p.new.data,created_at:p.new.created_at};
            if(!loaded)pending[p.new.id]=row;
            drop(p.new.id);rows.push(row)
          }emit()})
        .on("postgres_changes",{event:"DELETE",schema:"public",table:"docs"},function(p){if(p.old&&p.old.collection===path){if(!loaded)pending[p.old.id]=null;drop(p.old.id);emit()}}).subscribe();
      return function(){sb.removeChannel(ch)}};
    return q}
  return {collection:col,doc:function(p){var x=split(p);return {
    set:function(d){return put(x.c,x.id,d)},
    get:function(){return sb.from("docs").select("id,data,created_at").eq("collection",x.c).eq("id",x.id).maybeSingle().then(chk).then(function(r){return r.data})},
    delete:function(){return sb.from("docs").delete().eq("collection",x.c).eq("id",x.id).then(chk)}
  }}}}
function mkRoom(){var ch=sb.channel("typing"),on=false;function go(){if(!on){on=true;ch.subscribe()}}
  return {on:function(t,h){ch.on("broadcast",{event:t},function(p){h({isMe:false,by:p.payload.by,data:p.payload.data})});setTimeout(go,0);return function(){}},
    emit:function(t,d){go();return ch.send({type:"broadcast",event:t,payload:{by:ME.id,data:d}})}}}
function mkAssets(){return {upload:function(b){var id=rid();return sb.storage.from("media").upload(id,b,{contentType:b.type||"application/octet-stream"}).then(chk).then(function(){return {id:id,url:BU+id}})}}}
async function boot(){
  if(!CFG.url||/YOUR/.test(CFG.url)||!frontendKeyAllowed(CFG.anonKey)||!window.supabase){$("login").className="auth-overlay on";$("lm").textContent="Supabase bağlantı ayarları geçersiz. config.js içinde URL ve yalnızca anon/publishable anahtar kullan.";["lb","authDivider","authForm","authMode"].forEach(function(i){$(i).hidden=true});return}
  sb=supabase.createClient(CFG.url,CFG.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  var r=await sb.auth.getSession();
  if(r.error){$("login").className="auth-overlay on";$("authError").textContent=r.error.message;return}
  var ses=r.data.session;
  if(!ses){$("login").className="auth-overlay on";return}
  $("login").className="auth-overlay";var u=ses.user;ME={id:u.id,email:u.email||"",name:(u.user_metadata&&(u.user_metadata.full_name||u.user_metadata.name))||(u.email||"").split("@")[0]};
  var D=mkDb(),R=mkRoom(),A=mkAssets(),U={id:function(){return Promise.resolve(ME.id)},me:function(){return Promise.resolve({name:ME.name})},profiles:function(ids){var o={};[].concat(ids).forEach(function(i){o[i]={name:""}});return Promise.resolve(o)},can:function(){return true}};
  window.claude={use:function(n){return Promise.resolve({db:D,user:U,assets:A,room:R}[n]||null)}};
  $("out").onclick=function(){sb.auth.signOut().then(function(){location.reload()})};
  sb.auth.onAuthStateChange(function(ev){if(ev==="SIGNED_OUT")location.reload()});
  startApp()}
var registering=false;
function setAuthMode(createAccount){
  registering=createAccount;
  $("authName").hidden=!createAccount;
  $("authName").required=createAccount;
  $("authPassword").autocomplete=createAccount?"new-password":"current-password";
  $("authSubmit").textContent=createAccount?"Kayıt ol":"Giriş yap";
  $("authMode").textContent=createAccount?"Zaten hesabın var mı? Giriş yap":"Hesabın yok mu? Kayıt ol";
  $("authError").textContent="";
}
function setAuthBusy(busy){
  ["lb","authSubmit","authMode"].forEach(function(i){$(i).disabled=busy});
}
$("authMode").onclick=function(){setAuthMode(!registering)};
$("authForm").onsubmit=async function(e){
  e.preventDefault();
  if(!sb)return;
  var email=$("authEmail").value.trim(),password=$("authPassword").value;
  setAuthBusy(true);$("authError").textContent="";
  try{
    var result=registering
      ?await sb.auth.signUp({email:email,password:password,options:{data:{name:$("authName").value.trim(),full_name:$("authName").value.trim()},emailRedirectTo:location.origin+location.pathname}})
      :await sb.auth.signInWithPassword({email:email,password:password});
    if(result.error)throw result.error;
    if(registering&&!result.data.session){
      $("authError").style.color="#d33";
      $("authError").textContent="Kayıttan sonra doğrudan giriş için Supabase Authentication ayarlarında Email provider içindeki Confirm email seçeneğini kapatıp tekrar dene.";
      return;
    }
    location.reload();
  }catch(err){
    $("authError").style.color="#d33";
    $("authError").textContent=err&&err.message?err.message:"Kimlik doğrulama başarısız oldu.";
  }finally{setAuthBusy(false)}
};
$("lb").onclick=async function(){
  if(!sb)return;
  setAuthBusy(true);$("authError").textContent="";
  try{
    var result=await sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.origin+location.pathname}});
    if(result.error)throw result.error;
  }catch(err){
    $("authError").style.color="#d33";
    $("authError").textContent=err&&err.message?err.message:"Google ile giriş başlatılamadı.";
    setAuthBusy(false);
  }
};
boot();
