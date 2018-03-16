const API = require('../../utils/api');

exports.list = class extends API {
    async list() {
        this.user.privilege.needs('administrator');
        return await this.mysql.query('SELECT * FROM tb_privileges WHERE account_id = ? ', [this.account.account_id]);
    }
}

exports.insert = class extends API {
    async insert() {
        this.user.privilege.needs('administrator');

        if(!('name' in this.request.body) || !('is_admin' in this.request.body))
            return false;

        const params = {
            account_id: this.account.account_id,
            name: this.request.body.name,
            is_admin: this.request.body.is_admin
        };

        return await this.mysql.query('INSERT INTO tb_privileges SET ?', [params], 'write');
    }
}

exports.update = class extends API {
    async update() {
        this.user.privilege.needs('administrator');

        const params = {
            account_id: this.account.account_id,
            name: this.request.body.name,
            is_admin: this.request.body.is_admin
        };

        return await this.mysql.query(
            'UPDATE tb_privileges SET ? WHERE privilege_id = ? AND account_id = ?',
            [params, this.request.body.privilege_id, this.account.account_id],
            'write'
        );
    }
}

exports.delete = class extends API {
    async delete() {
        this.user.privilege.needs('administrator');

        return await this.mysql.query(
            'DELETE FROM tb_privileges WHERE privilege_id = ? AND account_id = ?',
            [this.request.body.privilege_id, this.account.account_id],
            'write'
        );
    }
}