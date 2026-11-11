// ต้องตรงกับสิทธิ์ในฟังก์ชัน SQL (004)
export const canIssueStock = (role) => ['store', 'admin'].includes(role)
