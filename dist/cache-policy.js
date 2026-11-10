// Never attach another account's browser saves to the newly signed-in account.
export function cacheAction(stored,incoming,link,count){if(stored===incoming)return 'reuse';if(count>0&&(!stored||link?.dirty||!link))return 'backup';return 'clear';}
