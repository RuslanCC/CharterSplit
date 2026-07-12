-- Карточка расхода в чате: id сообщения бота, которое он редактирует при изменении расхода.
ALTER TABLE "Expense" ADD COLUMN "chatMessageId" BIGINT;
