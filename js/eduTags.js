/** 学历名称展示用 class：清北金、海归/985 紫、211 蓝、其余白 */
export function educationTagClass(eduId) {
  if (eduId === "edu_qingbei") return "edu-tag edu-tag-qingbei";
  if (eduId === "edu_985" || eduId === "edu_haigui") return "edu-tag edu-tag-haigui-985";
  if (eduId === "edu_211") return "edu-tag edu-tag-211";
  return "edu-tag edu-tag-default";
}
