import { transferMarkup, bindTransfer } from './data-transfer.js';

const container = document.querySelector('#data-transfer');
container.innerHTML = transferMarkup();
bindTransfer(container);
