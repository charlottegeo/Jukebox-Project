from app import ldap

def ldap_is_eboard(uid):
    member = ldap.get_member(uid, uid=True)
    group_list = member.get('memberOf')
    for group_dn in group_list:
        if group_dn.split(",")[0][3:] == "eboard":
            return True
    return False

def ldap_is_rtp(uid):
    rtp_group = ldap.get_group("rtp")
    return rtp_group.check_member(ldap.get_member(uid, uid=True))

#TODO: Add function for catjam maintainers