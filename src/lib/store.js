// ต้องตรงกับสิทธิ์ใน SQL (004/005)
export const canManageStore = (role) => ['store', 'admin'].includes(role)
export const canIssueStock = canManageStore
