const APP_ID = "cli_a9744fcb1a391cc8";
const APP_SECRET = "KMBW1e83BhwdYRViYb1e1gDPLA2mHXZ8";

const APP_TOKEN = "NeCRbtLv2a6TfbsD3s1cHq3hncf";
const TABLE_ID = "tblFGeKrKgVPxfAu";


// =====================
// token
// =====================
async function getToken() {

  const res = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: APP_ID,
        app_secret: APP_SECRET
      })
    }
  );

  const json = await res.json();

  if (json.code !== 0) {
    throw new Error(JSON.stringify(json));
  }

  return json.tenant_access_token;
}


// =====================
// API入口
// =====================
export async function onRequestGet(context) {

  const url = new URL(context.request.url);
  const type = url.searchParams.get("type");

  const token = await getToken();

  // =====================
  // 🔥 1. 列表接口
  // =====================
  if (type === "list") {

    const res = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/search`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      }
    );

    const json = await res.json();

    const list = json.data.items.map(i => ({
      id: i.record_id,
      编号: i.fields["资产编号"],
      名称: i.fields["资产名称"],
      状态: i.fields["资产状态"]
    }));

    return jsonOK(list);
  }


  // =====================
  // 🔥 2. 详情接口
  // =====================
  const id = url.searchParams.get("id");

  const res = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${id}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const json = await res.json();

  const f = json.data.record.fields;

  return jsonOK({
    资产编号: f["资产编号"],
    资产名称: f["资产名称"],
    类别: f["资产类别"],
    日期: f["购置日期"],
    价格: f["购置价格"],
    负责人: f["负责人"]?.[0]?.name,
    部门: f["使用部门"],
    状态: f["资产状态"]
  });
}


// =====================
function jsonOK(data) {
  return new Response(JSON.stringify({
    code: 0,
    data
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
