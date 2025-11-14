const getISTTimestamp = (dateTime = new Date()) => new Date(dateTime).toLocaleString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata', hour12: false }).replace(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/, '$3-$2-$1 $4:$5:$6');
const getISTDate = (date = new Date()) => new Date(date).toLocaleDateString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Kolkata' }).split('/').reverse().join('-');

export { getISTTimestamp, getISTDate }