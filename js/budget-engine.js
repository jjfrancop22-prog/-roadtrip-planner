export function sumBudget(items=[]){return items.reduce((sum,item)=>sum+(Number(item?.amount)||0),0);}
